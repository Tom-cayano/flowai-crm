import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { generateFullProgramWithAI } from "@/lib/openai/server";

const BROKEN_VIDEO_IDS = ["pSHjTRCQxIw", "dQw4w9WgXcQ"];

function isVideoUrlValid(url: string | null | undefined): boolean {
    if (!url) return false;
    if (url.includes("supabase.co/storage")) return true;
    if (url.includes("watch?v=")) return false;
    if (!url.includes("youtube.com/embed/")) return false;
    const idMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]+)/);
    if (!idMatch) return false;
    return !BROKEN_VIDEO_IDS.includes(idMatch[1]);
}

function normalizeText(text: string): string {
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

const GOAL_TO_MUSCLE: Record<string, string> = {
    "glute": "gluteos", "glutes": "gluteos", "gluteo": "gluteos", "gluteos": "gluteos",
    "cola": "gluteos", "booty": "gluteos",
    "legs": "cuadriceps", "piernas": "cuadriceps", "cuadriceps": "cuadriceps",
    "hamstring": "femorales", "femorales": "femorales", "isquio": "femorales",
    "chest": "pecho", "pecho": "pecho",
    "back": "espalda", "espalda": "espalda",
    "shoulders": "hombros", "hombros": "hombros",
    "biceps": "biceps", "triceps": "triceps",
    "core": "core", "abdomen": "core", "abs": "core",
    "cardio": "cardio",
};

function resolveMuscleGroup(goal: string): string | null {
    if (!goal) return null;
    const g = normalizeText(goal);
    if (GOAL_TO_MUSCLE[g]) return GOAL_TO_MUSCLE[g];
    for (const key of Object.keys(GOAL_TO_MUSCLE)) {
        if (g.includes(normalizeText(key))) return GOAL_TO_MUSCLE[key];
    }
    return null;
}

export async function POST(request: NextRequest) {
    try {
        const cookieStore = await cookies();
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll: () => cookieStore.getAll(),
                    setAll: () => { },
                },
            }
        );

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await request.json();
        const { goal, durationWeeks, daysPerWeek, level, type } = body;

        const safeDays = Math.min(Math.max(parseInt(daysPerWeek) || 3, 3), 5);
        const safeWeeks = Math.min(Math.max(parseInt(durationWeeks) || 4, 1), 12);
        const muscleGroup = resolveMuscleGroup(goal || "");

        console.log(`[generate-program] goal="${goal}" → muscleGroup="${muscleGroup}" | days=${safeDays} weeks=${safeWeeks}`);

        // 1. Cargar biblioteca
        const { data: library, error: libError } = await supabase
            .from("exercise_library")
            .select("id, name, video_url, muscle_group");

        if (libError || !library) throw new Error("Error loading exercise library");

        // Filtrar vídeos rotos
        const cleanLibrary = library.filter(ex => isVideoUrlValid(ex.video_url));
        console.log(`[generate-program] Total: ${library.length}, vídeo válido: ${cleanLibrary.length}`);

        // Filtrar por muscle_group
        let filteredLibrary = cleanLibrary;
        if (muscleGroup) {
            const muscleFiltered = cleanLibrary.filter(ex =>
                ex.muscle_group?.toLowerCase() === muscleGroup
            );
            if (muscleFiltered.length >= 6) {
                filteredLibrary = muscleFiltered;
                console.log(`[generate-program] Filtrado por "${muscleGroup}": ${filteredLibrary.length} ejercicios`);
            } else {
                console.warn(`[generate-program] Solo ${muscleFiltered.length} para "${muscleGroup}", usando biblioteca completa`);
            }
        }

        if (filteredLibrary.length === 0) {
            return NextResponse.json({ error: "No hay ejercicios válidos en la biblioteca" }, { status: 500 });
        }

        const exerciseMap = new Map(filteredLibrary.map(e => [e.id, e]));
        const exerciseRefs = filteredLibrary.map(e => ({ id: e.id, name: e.name }));

        // 2. Generar con OpenAI
        let days: any[];
        try {
            days = await generateFullProgramWithAI({
                goal,
                level,
                weeks: 1,
                daysPerWeek: safeDays,
                exercises: exerciseRefs,
                type
            });
        } catch (aiError: any) {
            console.error("AI Generation Error:", aiError);
            return NextResponse.json({ error: "Error al generar con IA: " + aiError.message }, { status: 500 });
        }

        // Deduplicar y limitar días
        const seenDayNums = new Set<number>();
        const uniqueDays = (days as any[])
            .filter((day: any) => {
                const dayNum = day.day ?? 0;
                if (seenDayNums.has(dayNum)) return false;
                seenDayNums.add(dayNum);
                return true;
            })
            .slice(0, safeDays);

        console.log(`[generate-program] Días únicos finales: ${uniqueDays.length}`);

        if (uniqueDays.length === 0) {
            return NextResponse.json({ error: "La IA no generó días válidos. Inténtalo de nuevo." }, { status: 500 });
        }

        // 3. Crear template
        const { data: template, error: tError } = await supabase
            .from("workout_templates")
            .insert({
                name: `Plan IA (${goal || 'Entrenamiento'})`,
                description: `Tipo: ${type || 'Standard'}. Nivel: ${level}. ${safeWeeks} semanas.`,
                trainer_id: user.id
            })
            .select()
            .single();

        if (tError) throw tError;

        // 4. Construir inserts — repetir días para safeWeeks semanas
        const inserts: any[] = [];

        for (let week = 1; week <= safeWeeks; week++) {
            uniqueDays.forEach((day: any, dayIdx: number) => {
                const usedInDay = new Set<string>();
                const exercises = (day.exercises || []).slice(0, 6);

                exercises.forEach((ex: any, exIdx: number) => {
                    if (!exerciseMap.has(ex.exercise_id)) {
                        console.warn(`ID inválido: ${ex.exercise_id}`);
                        return;
                    }

                    const found = exerciseMap.get(ex.exercise_id)!;

                    if (muscleGroup && found.muscle_group?.toLowerCase() !== muscleGroup) {
                        console.warn(`Músculo incorrecto: ${found.name} (${found.muscle_group})`);
                        return;
                    }

                    if (usedInDay.has(found.id)) return;
                    usedInDay.add(found.id);

                    const safeVideoUrl = isVideoUrlValid(found.video_url) ? found.video_url : null;

                    inserts.push({
                        template_id: template.id,
                        exercise_id: found.id,
                        exercise_name: found.name,
                        video_url: safeVideoUrl,
                        sets: parseInt(ex.sets) || 3,
                        reps: String(ex.reps || "10-12"),
                        rest_seconds: parseInt(String(ex.rest || ex.rest_seconds)) || 60,
                        order_index: (week - 1) * 100 + dayIdx * 10 + exIdx,
                    });
                });
            });
        }

        console.log(`[generate-program] Total inserts: ${inserts.length} (${safeWeeks}sem × ${uniqueDays.length}días)`);

        if (inserts.length === 0) {
            await supabase.from("workout_templates").delete().eq("id", template.id);
            return NextResponse.json({ error: "La IA no generó ejercicios válidos. Inténtalo de nuevo." }, { status: 500 });
        }

        const { error: insError } = await supabase
            .from("workout_template_exercises")
            .insert(inserts);

        if (insError) {
            await supabase.from("workout_templates").delete().eq("id", template.id);
            throw insError;
        }

        return NextResponse.json({
            success: true,
            templateId: template.id,
            stats: {
                weeks: safeWeeks,
                daysPerWeek: uniqueDays.length,
                totalExercises: inserts.length,
            }
        });

    } catch (e: any) {
        console.error("Critical error in generate-program:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
