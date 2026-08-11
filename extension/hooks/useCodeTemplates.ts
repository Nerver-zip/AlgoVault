import { useEffect, useState, useCallback } from "react"
import { Storage } from "@plasmohq/storage"

const storage = new Storage({ area: "local" })
export const TEMPLATES_STORAGE_KEY = "algovault.code_templates"

export interface CodeTemplate {
  id: string
  title: string
  language: "cpp" | "java" | "python" | "go" | "typescript"
  tags: string[]
  description?: string
  code: string
  createdAt: number
  isBuiltIn?: boolean
}

export const BUILTIN_TEMPLATES: CodeTemplate[] = []

export function useCodeTemplates() {
  const [templates, setTemplates] = useState<CodeTemplate[]>([])
  const [loading, setLoading] = useState(true)

  const loadTemplates = useCallback(async () => {
    try {
      const userTemplates = (await storage.get<CodeTemplate[]>(TEMPLATES_STORAGE_KEY)) || []
      setTemplates(userTemplates)
    } catch (err) {
      console.error("Failed to load code templates:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTemplates()

    const listener = (changes: Record<string, any>, areaName: string) => {
      if (areaName === "local" && changes[TEMPLATES_STORAGE_KEY]) {
        loadTemplates()
      }
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [loadTemplates])

  const saveUserTemplates = async (updated: CodeTemplate[]) => {
    await storage.set(TEMPLATES_STORAGE_KEY, updated)
    setTemplates(updated)
  }

  const addTemplate = async (template: Omit<CodeTemplate, "id" | "createdAt">) => {
    const newTemplate: CodeTemplate = {
      ...template,
      id: `custom-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: Date.now(),
      isBuiltIn: false
    }
    const next = [newTemplate, ...templates]
    await saveUserTemplates(next)
    return newTemplate
  }

  const updateTemplate = async (id: string, updates: Partial<Omit<CodeTemplate, "id">>) => {
    const next = templates.map((t) => (t.id === id ? { ...t, ...updates } : t))
    await saveUserTemplates(next)
  }

  const deleteTemplate = async (id: string) => {
    const next = templates.filter((t) => t.id !== id)
    await saveUserTemplates(next)
  }

  return {
    templates,
    loading,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    reloadTemplates: loadTemplates
  }
}
