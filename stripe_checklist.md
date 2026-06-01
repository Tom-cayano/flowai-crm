# Checklist de Stripe & Despliegue en Producción — FlowAI CRM

Sigue esta guía paso a paso para configurar Stripe en modo producción (o modo test) y enlazarlo con el CRM.

---

## 1. Productos y Precios a Crear en Stripe

Debes crear **3 Productos** en tu [Stripe Dashboard → Products](https://dashboard.stripe.com/products). Para cada producto, debes configurar sus precios oficiales y los precios promocionales correspondientes.

### PRODUCTO 1: FlowAI Starter
* **Descripción:** Para equipos pequeños
* **Precios a añadir:**
  1. **Mensual Oficial:** `29,00 €` (Recurrente, mensual)
  2. **Anual Oficial:** `290,00 €` (Recurrente, anual — equivale a 24,16 €/mes)
  3. **Mensual Promoción:** `19,00 €` (Recurrente, mensual — para los primeros 20 clientes)

### PRODUCTO 2: FlowAI Pro
* **Descripción:** Para equipos en crecimiento
* **Precios a añadir:**
  1. **Mensual Oficial:** `79,00 €` (Recurrente, mensual)
  2. **Anual Oficial:** `790,00 €` (Recurrente, anual — equivale a 65,83 €/mes)
  3. **Mensual Promoción:** `59,00 €` (Recurrente, mensual — para los primeros 20 clientes)

### PRODUCTO 3: FlowAI Agency
* **Descripción:** Para agencias y equipos grandes
* **Precios a añadir:**
  1. **Mensual Oficial:** `199,00 €` (Recurrente, mensual)
  2. **Anual Oficial:** `1.990,00 €` (Recurrente, anual — equivale a 165,83 €/mes)
  3. **Mensual Promoción:** `149,00 €` (Recurrente, mensual — para los primeros 20 clientes)

---

## 2. Configuración de Webhook en Stripe

Ve a [Stripe Dashboard → Developers → Webhooks](https://dashboard.stripe.com/webhooks) y añade un nuevo Endpoint.

* **URL del endpoint:** `https://flowaicrm.com/api/billing/webhooks`
* **Eventos a escuchar:**
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `customer.subscription.trial_will_end`
  - `invoice.paid`
  - `invoice.payment_failed`

*Una vez creado, copia el "Secreto de firma" (empieza por `whsec_...`) para configurarlo en las variables de entorno.*

---

## 3. Variables de Entorno en Vercel (Producción)

Debes configurar las siguientes variables de entorno en Vercel. Sustituye los placeholders (`prod_...` y `price_...`) por los IDs reales generados por Stripe en tu Dashboard.

```bash
# Stripe Keys
STRIPE_SECRET_KEY="sk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# URL Base de la Aplicación
NEXT_PUBLIC_APP_URL="https://flowaicrm.com"

# Plan Starter Price IDs
STRIPE_PRICE_STARTER_MONTHLY="price_..."       # ID del precio oficial mensual (29€)
STRIPE_PRICE_STARTER_YEARLY="price_..."        # ID del precio oficial anual (290€)
STRIPE_PRICE_STARTER_PROMO_MONTHLY="price_..."  # ID del precio promo mensual (19€)

# Plan Pro Price IDs
STRIPE_PRICE_PRO_MONTHLY="price_..."           # ID del precio oficial mensual (79€)
STRIPE_PRICE_PRO_YEARLY="price_..."            # ID del precio oficial anual (790€)
STRIPE_PRICE_PRO_PROMO_MONTHLY="price_..."     # ID del precio promo mensual (59€)

# Plan Agency Price IDs
STRIPE_PRICE_AGENCY_MONTHLY="price_..."         # ID del precio oficial mensual (199€)
STRIPE_PRICE_AGENCY_YEARLY="price_..."          # ID del precio oficial anual (1990€)
STRIPE_PRICE_AGENCY_PROMO_MONTHLY="price_..."   # ID del precio promo mensual (149€)
```

> [!TIP]
> **Promoción de Lanzamiento:** Durante la fase de lanzamiento (primeros 20 clientes), cambia la variable `STRIPE_PRICE_XXX_MONTHLY` en Vercel para que use el ID del precio promocional (19€, 59€, 149€) o asegúrate de que tus planes lo ofrezcan por defecto en el portal si así lo deseas. El mapeador en la DB (`resolvePlanId`) reconocerá tanto el ID oficial como el promocional de forma nativa.

---

## 4. Configurar Stripe Customer Portal

Ve a [Stripe Dashboard → Settings → Customer portal](https://dashboard.stripe.com/settings/billing/portal) para activar y diseñar el portal de autogestión de clientes:
* **Funciones permitidas:**
  - Activar "Cancelar suscripciones".
  - Activar "Actualizar suscripciones" (selecciona los 3 productos creados para que puedan hacer Upgrade/Downgrade).
  - Activar "Actualizar métodos de pago" e "Historial de facturación".
