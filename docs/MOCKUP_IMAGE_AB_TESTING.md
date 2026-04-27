# Mockup images (Vertex Gemini vs OpenAI)

Mockups use **Vertex AI** with **Gemini 3.1 Flash Image** (`gemini-3.1-flash-image-preview`, also called **Nano Banana 2**) when `GOOGLE_CLOUD_PROJECT` is set and credentials work — **image + text in → image out** via `@google/genai` with `vertexai: true` (see [Gemini 3.1 Flash Image](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-1-flash-image)). The app always uses Vertex **`location: global`** for this model (required by Google Cloud).

If `GOOGLE_CLOUD_PROJECT` is **not** set (and you did not set `MOCKUP_IMAGE_PROVIDER=openai`), **mockup generation fails** when the image step runs, with a clear Vertex setup error. If Vertex is configured but the image call fails (including RAPT / `invalid_grant` on user ADC), you either see an error or — when **`MOCKUP_VERTEX_AUTH_OPENAI_FALLBACK` is allowed** (see table) — an automatic OpenAI image retry. The **concept fallback** (OpenAI DALL·E) applies when you use **`MOCKUP_IMAGE_PROVIDER=openai`** and `gpt-image-1` image edit fails.

### Why `invalid_rapt` keeps coming back with `gcloud auth application-default login`

That flow stores **your user’s** OAuth Application Default Credentials. **Google Workspace** and account security policies can force **re-authentication** on a schedule. The app cannot prevent that.

**Durable options:** (1) **`GOOGLE_APPLICATION_CREDENTIALS`** pointed at a **service account** JSON with **Vertex AI User** (if your org allows keys — rotate per policy). (2) Run mockups on **GCP** (Cloud Run / GCE) with an **attached** service account — no key file. (3) Local dev without Vertex: **`MOCKUP_IMAGE_PROVIDER=openai`**. (4) Bridge while fixing auth: **`MOCKUP_VERTEX_AUTH_OPENAI_FALLBACK=1`** + **`OPENAI_API_KEY`** so Vertex RAPT errors retry with OpenAI (including `/try` when the fallback policy allows it).

Each saved mockup stores `bid_photos.mockup_image_provider` (`openai`, `vertex_gemini`, or a concept fallback). The caption includes `[Image model: …]` for quick scanning.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `MOCKUP_IMAGE_PROVIDER` | **Default / `auto` / `vertex`:** mockup **room edits** use Vertex only; missing `GOOGLE_CLOUD_PROJECT` (or bad ADC) throws a setup error. `openai`: OpenAI image edit for mockups (local dev without GCP). **Note:** questionnaire, materials, and scope text still use OpenAI. |
| `MOCKUP_VERTEX_AUTH_OPENAI_FALLBACK` | **Optional, default off in production.** If `1` / `true` / `yes`, after Vertex **user-credential / RAPT** errors only, retry mockup image generation with OpenAI (requires `OPENAI_API_KEY`). When unset, non-production defaults to allowing this fallback. |
| `MOCKUP_VERTEX_TIMEOUT_OPENAI_FALLBACK` | Same pattern as auth fallback: after Vertex **wall-clock timeout** on the image request, `/try` can retry with OpenAI image edit (requires `OPENAI_API_KEY`). Unset → allowed in non-production; set `0` to disable; set `1` to allow in production. |
| `MOCKUP_VERTEX_QUOTA_OPENAI_FALLBACK` | Same pattern: after Vertex returns **HTTP 429 / RESOURCE_EXHAUSTED** (quota or burst rate limit) on the mockup image call, `/try` can retry with OpenAI image edit (requires `OPENAI_API_KEY`). Unset → allowed in non-production; set `0` to disable; set `1` to allow in production. |
| `VERTEX_MOCKUP_REQUEST_TIMEOUT_MS` | Per-request deadline for one Vertex `generateContent` image call (ms). Clamped **120000–600000**; default **300000** (5 minutes). |
| `OPENAI_API_KEY` | Required for materials + OpenAI paths. |
| `OPENAI_IMAGE_EDIT_MODEL` | Optional OpenAI image edit model id. |
| `GOOGLE_CLOUD_PROJECT` | **Required for Vertex mockups.** Your GCP project id (e.g. `my-project-123`). |
| `GOOGLE_APPLICATION_CREDENTIALS` | **Optional.** Only if you use a **service account key file** (often blocked by org policy). Prefer ADC without this (see below). |

`GOOGLE_CLOUD_LOCATION` is **not** used for Gemini 3.1 Flash Image (the app uses the global endpoint). You may still set it for other GCP tooling.

## If you see: `iam.disableServiceAccountKeyCreation`

Your org **forbids downloading service account JSON keys**. That is normal for enterprise GCP. **You do not need a key** to use Vertex from this app.

### Option A — Local dev: user login (no keys)

1. Install [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) (`gcloud`).
2. `gcloud auth login` — sign in with your Google account that has access to the project.
3. `gcloud auth application-default login` — creates **Application Default Credentials** (OAuth user refresh token), **not** a service account key. The `@google/genai` SDK uses this automatically.
4. Set project for gcloud: `gcloud config set project YOUR_PROJECT_ID`
5. In `.env.local` set **only** (no `GOOGLE_APPLICATION_CREDENTIALS`):

   ```env
   GOOGLE_CLOUD_PROJECT=your-project-id
   ```

6. Your user must have permission to call Vertex AI in that project (e.g. **Vertex AI User** on the project, or a suitable custom role).

### Option B — Production on Google Cloud (no keys)

Deploy the app to **Cloud Run**, **GKE**, or **Compute Engine** and attach a **service account** to the workload (runtime identity). **Do not** create a key: the metadata server provides credentials. Set `GOOGLE_CLOUD_PROJECT` in the service env; leave `GOOGLE_APPLICATION_CREDENTIALS` unset.

### Option C — Production outside GCP (Vercel, etc.)

Prefer **Workload Identity Federation** (OIDC) so your host assumes a Google identity **without** a long‑lived key — see [Workload identity federation](https://cloud.google.com/iam/docs/workload-identity-federation). Setup is platform-specific; many teams use a **small GCP-hosted** API proxy or run mockup generation on Cloud Run for this reason.

### Option D — Org admin only: allow keys on a sandbox

If you **must** use a JSON key (e.g. legacy host only supports file-based secrets), an **Organization Policy Administrator** can adjust or exempt `iam.disableServiceAccountKeyCreation` for a **dedicated sandbox project**. This is weaker than Options A–C.

---

## Google Cloud setup (project + APIs + IAM)

1. **Create or pick a GCP project**  
   [Google Cloud Console](https://console.cloud.google.com/) → select project → note **Project ID**.

2. **Enable billing** on the project (Vertex AI is billed).

3. **Enable APIs**  
   - Vertex AI API (`aiplatform.googleapis.com`) — enable in APIs & Services.

4. **Grant your identity access** (pick what applies):
   - **User ADC (Option A):** grant **your user** (or a Google Group) a role on the project such as **Vertex AI User** (`roles/aiplatform.user`).
   - **Runtime SA (Option B):** create a **service account** (no key), grant it **Vertex AI User**, attach it to Cloud Run / GCE.

5. **Credentials**  
   - **Do not** set `GOOGLE_APPLICATION_CREDENTIALS` if you use `gcloud auth application-default login` (Option A) or a **attached** service account on GCP (Option B).  
   - Only set `GOOGLE_APPLICATION_CREDENTIALS` if your org allows a key file and you intentionally use one.

6. **Apply DB migration**  
   Run `supabase/migrations/006_mockup_image_provider.sql` (or your usual migration process) so `bid_photos.mockup_image_provider` exists.

## “Vertex still not working” — quick checks

1. **Server time limit** — `src/app/dashboard/bids/[bidId]/layout.tsx` exports `maxDuration = 800` (seconds) so `generateBidAi` can finish a Vertex run. Your host may cap lower (e.g. Vercel Hobby ~60s): if the estimate stays **pending** forever, the function was probably killed mid-run; upgrade the plan / raise the cap or run locally.
2. **Restart Next.js** after changing `.env.local` (`npm run dev` again). Env is read at process start.
3. **Project id only** — `GOOGLE_CLOUD_PROJECT` must be the **Project ID** (lowercase, often with a hyphen), not the project *name* or number. Remove accidental UTF-8 BOM / spaces (the app trims these, but your shell might not).
4. **ADC on your machine** — from repo root run:
   ```bash
   npm run vertex:smoke
   ```
   If this fails, fix GCP before expecting mockups to work in the app. Typical fixes: `gcloud auth application-default login`, enable **Vertex AI API** + billing, grant **Vertex AI User** on the project.
5. Optional **`VERTEX_MOCKUP_IMAGE_MODEL`** if Google publishes a different model id for your region.

## Analyzing results

Query mockups by provider:

```sql
select mockup_image_provider, count(*) 
from bid_photos 
where kind = 'after_mockup' 
group by mockup_image_provider;
```

## Notes

- **Imagen** (non-Gemini) mask-based editing is separate; this integration uses **Gemini image** on Vertex because it matches “photo + prompt → edited photo” without a mask.
- If `GOOGLE_CLOUD_PROJECT` is unset, configure Vertex or set `MOCKUP_IMAGE_PROVIDER=openai` for local-only OpenAI image edits.
- **Hosted deploys (Vercel, etc.)** use that platform’s env vars — not your laptop’s `.env.local`. If production still shows `[Image model: OpenAI …]`, the host likely has `MOCKUP_IMAGE_PROVIDER=openai` or is missing `GOOGLE_CLOUD_PROJECT` / ADC (which would error unless OpenAI-only was set).
- Model names and availability change; verify [Gemini models](https://cloud.google.com/vertex-ai/generative-ai/docs/models#gemini-models) if Google updates the catalog.
