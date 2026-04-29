import * as Provider from "#provider/provider.ts"

const MODEL_LIST_CACHE_TTL_MS = 30_000
const DEFAULT_MODEL_LIST_TIMEOUT_MS = 2_500

interface ModelListCacheEntry {
  items: Provider.PublicModel[]
  pending?: Promise<Provider.PublicModel[]>
  updatedAt: number
}

const modelListCache = new Map<string, ModelListCacheEntry>()
const modelListCacheGeneration = new Map<string, number>()

function getCacheGeneration(projectID: string) {
  return modelListCacheGeneration.get(projectID) ?? 0
}

function bumpCacheGeneration(projectID: string) {
  modelListCacheGeneration.set(projectID, getCacheGeneration(projectID) + 1)
}

function getModelListTimeoutMS() {
  const parsed = Number(process.env.FANFANDE_MODEL_LIST_TIMEOUT_MS)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MODEL_LIST_TIMEOUT_MS
}

function withTimeout<T>(promise: Promise<T>, timeoutMS: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined

  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timeout = setTimeout(() => reject(new Error(`Model list request exceeded ${timeoutMS}ms`)), timeoutMS)
    }),
  ]).finally(() => {
    if (timeout) clearTimeout(timeout)
  })
}

function startModelListLoad(projectID: string) {
  const existing = modelListCache.get(projectID)
  const generation = getCacheGeneration(projectID)
  const pending = Provider.listModels(projectID)
    .then((items) => {
      if (getCacheGeneration(projectID) === generation) {
        modelListCache.set(projectID, {
          items,
          updatedAt: Date.now(),
        })
      }
      return items
    })
    .catch((error) => {
      if (getCacheGeneration(projectID) === generation) {
        if (existing && existing.updatedAt > 0) {
          modelListCache.set(projectID, {
            items: existing.items,
            updatedAt: existing.updatedAt,
          })
        } else {
          modelListCache.delete(projectID)
        }
      }
      throw error
    })

  modelListCache.set(projectID, {
    items: existing?.items ?? [],
    pending,
    updatedAt: existing?.updatedAt ?? 0,
  })

  return pending
}

export function clearProjectModelListCache(projectID?: string) {
  if (projectID) {
    bumpCacheGeneration(projectID)
    modelListCache.delete(projectID)
    return
  }

  for (const cacheProjectID of modelListCache.keys()) {
    bumpCacheGeneration(cacheProjectID)
  }
  modelListCache.clear()
}

export async function listProjectModelsWithFallback(projectID: string) {
  const existing = modelListCache.get(projectID)
  const now = Date.now()

  if (existing && existing.updatedAt > 0 && now - existing.updatedAt < MODEL_LIST_CACHE_TTL_MS) {
    return existing.items
  }

  const pending = existing?.pending ?? startModelListLoad(projectID)

  try {
    return await withTimeout(pending, getModelListTimeoutMS())
  } catch {
    if (existing && existing.updatedAt > 0) {
      return existing.items
    }

    return []
  }
}

export function findModelByReference(items: Provider.PublicModel[], value: string | undefined) {
  const [providerID, ...rest] = value?.split("/") ?? []
  const modelID = rest.join("/")
  if (!providerID || !modelID) return null

  return items.find((model) => model.providerID === providerID && model.id === modelID) ?? null
}

export async function resolveEffectiveModelWithFallback(
  projectID: string,
  items: Provider.PublicModel[],
  preferredModel?: string,
) {
  const preferred = findModelByReference(items, preferredModel)
  if (preferred) return preferred

  const projectSelection = await Provider.getSelection(projectID).catch(() => undefined)
  const configuredDefault = findModelByReference(items, projectSelection?.model)
  if (configuredDefault) return configuredDefault

  return items.find((model) => model.available) ?? null
}
