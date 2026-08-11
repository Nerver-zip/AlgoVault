import React, { useMemo, useState } from "react"
import {
  Check,
  Code2,
  Copy,
  Edit3,
  Filter,
  Plus,
  Search,
  Trash2,
  X,
  FileCode,
  Tag,
  Sparkles
} from "lucide-react"
import { Card } from "../ui/Card"
import { useCodeTemplates, type CodeTemplate } from "../../hooks/useCodeTemplates"
import { motion, AnimatePresence } from "framer-motion"

const LANG_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  cpp: { label: "C++", color: "#38bdf8", bg: "rgba(56,189,248,0.12)", border: "rgba(56,189,248,0.25)" },
  java: { label: "Java", color: "#f59e0b", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.25)" },
  python: { label: "Python", color: "#34d399", bg: "rgba(52,211,153,0.12)", border: "rgba(52,211,153,0.25)" },
  go: { label: "Go", color: "#a855f7", bg: "rgba(168,85,247,0.12)", border: "rgba(168,85,247,0.25)" },
  typescript: { label: "TypeScript", color: "#ef4444", bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.25)" }
}

export const TemplateVault = () => {
  const { templates, loading, addTemplate, updateTemplate, deleteTemplate } = useCodeTemplates()
  const [search, setSearch] = useState("")
  const [langFilter, setLangFilter] = useState<string>("all")
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<CodeTemplate | null>(null)
  const [formTitle, setFormTitle] = useState("")
  const [formLang, setFormLang] = useState<"cpp" | "java" | "python" | "go" | "typescript">("cpp")
  const [formTags, setFormTags] = useState("")
  const [formDesc, setFormDesc] = useState("")
  const [formCode, setFormCode] = useState("")

  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      const matchLang = langFilter === "all" || t.language === langFilter
      const query = search.toLowerCase().trim()
      const matchQuery =
        !query ||
        t.title.toLowerCase().includes(query) ||
        (t.description && t.description.toLowerCase().includes(query)) ||
        t.tags.some((tag) => tag.toLowerCase().includes(query)) ||
        t.code.toLowerCase().includes(query)
      return matchLang && matchQuery
    })
  }, [templates, langFilter, search])

  const handleCopy = (t: CodeTemplate) => {
    navigator.clipboard.writeText(t.code)
    setCopiedId(t.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const openCreateModal = () => {
    setEditingTemplate(null)
    setFormTitle("")
    setFormLang("cpp")
    setFormTags("")
    setFormDesc("")
    setFormCode("")
    setIsModalOpen(true)
  }

  const openEditModal = (t: CodeTemplate) => {
    setEditingTemplate(t)
    setFormTitle(t.title)
    setFormLang(t.language)
    setFormTags(t.tags.join(", "))
    setFormDesc(t.description || "")
    setFormCode(t.code)
    setIsModalOpen(true)
  }

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formTitle.trim() || !formCode.trim()) return

    const parsedTags = formTags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)

    if (editingTemplate) {
      await updateTemplate(editingTemplate.id, {
        title: formTitle.trim(),
        language: formLang,
        tags: parsedTags,
        description: formDesc.trim(),
        code: formCode
      })
    } else {
      await addTemplate({
        title: formTitle.trim(),
        language: formLang,
        tags: parsedTags.length > 0 ? parsedTags : ["Custom"],
        description: formDesc.trim(),
        code: formCode
      })
    }
    setIsModalOpen(false)
  }

  return (
    <div className="grid gap-3.5 pb-6 font-sans animate-fadeIn">
      {/* Search & Actions Bar */}
      <Card className="p-3 border border-zinc-800/80 bg-zinc-950/80 shadow-md">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center justify-between">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search code templates or tags (e.g. DSU, Segment Tree)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:border-[#dfa054]/50 focus:outline-none font-sans transition-all"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#dfa054]/40 bg-[#dfa054]/10 px-3 py-1.5 text-xs font-mono font-bold text-[#dfa054] transition-all hover:bg-[#dfa054]/20 cursor-pointer shrink-0 shadow-sm"
          >
            <Plus size={13} /> New Template
          </button>
        </div>

        {/* Language Filter Chips */}
        <div className="mt-3 flex gap-1.5 overflow-x-auto border-t border-zinc-800/60 pt-2.5 scrollbar-none">
          <button
            type="button"
            onClick={() => setLangFilter("all")}
            className={`rounded-md px-2.5 py-1 text-[10px] font-mono font-bold transition-all shrink-0 ${
              langFilter === "all"
                ? "bg-[#dfa054]/15 text-[#dfa054] border border-[#dfa054]/40 shadow-sm"
                : "text-zinc-400 border border-transparent hover:bg-zinc-900 hover:text-zinc-200"
            }`}
          >
            All Languages ({templates.length})
          </button>
          {Object.entries(LANG_META).map(([key, meta]) => {
            const count = templates.filter((t) => t.language === key).length
            const isActive = langFilter === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setLangFilter(key)}
                className={`rounded-md px-2.5 py-1 text-[10px] font-mono font-bold transition-all shrink-0 ${
                  isActive
                    ? "bg-zinc-800 text-zinc-100 border border-zinc-700 shadow-sm"
                    : "text-zinc-400 border border-transparent hover:bg-zinc-900 hover:text-zinc-200"
                }`}
                style={isActive ? { color: meta.color, borderColor: meta.border } : {}}
              >
                {meta.label} ({count})
              </button>
            )
          })}
        </div>
      </Card>

      {/* Templates List */}
      {filteredTemplates.length === 0 ? (
        <Card className="p-8 text-center border border-zinc-800/80 bg-zinc-950/60">
          <FileCode size={28} className="mx-auto text-zinc-600 mb-2" />
          <h3 className="text-xs font-bold text-zinc-300">No code templates found</h3>
          <p className="mt-1 text-[11px] text-zinc-500">
            {search ? `No snippets match "${search}". Try clearing your search.` : "Add your first competitive programming template!"}
          </p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filteredTemplates.map((t) => {
            const langMeta = LANG_META[t.language] || LANG_META.cpp
            const isCopied = copiedId === t.id

            return (
              <Card key={t.id} className="p-3.5 border border-zinc-800/80 bg-zinc-950/70 hover:border-zinc-700 transition-all shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="rounded px-2 py-0.5 text-[9px] font-mono font-bold border uppercase tracking-wider shrink-0"
                        style={{ backgroundColor: langMeta.bg, borderColor: langMeta.border, color: langMeta.color }}
                      >
                        {langMeta.label}
                      </span>
                      <h3 className="text-xs font-bold text-zinc-100 truncate">{t.title}</h3>
                    </div>

                    {t.description && (
                      <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400 font-sans">{t.description}</p>
                    )}

                    {t.tags && t.tags.length > 0 && (
                      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                        {t.tags.map((tag) => (
                          <span key={tag} className="inline-flex items-center gap-1 text-[9.5px] font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded">
                            <Tag size={9} className="text-zinc-500" /> {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopy(t)}
                      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-mono font-bold transition-all cursor-pointer ${
                        isCopied
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                          : "bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/80"
                      }`}
                      title="Copy code to clipboard"
                    >
                      {isCopied ? <Check size={11} /> : <Copy size={11} />}
                      {isCopied ? "Copied!" : "Copy Code"}
                    </button>
                    {!t.isBuiltIn && (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditModal(t)}
                          className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
                          title="Edit Template"
                        >
                          <Edit3 size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteTemplate(t.id)}
                          className="rounded-md p-1.5 text-zinc-500 hover:bg-rose-950/40 hover:text-rose-400 transition-colors"
                          title="Delete Template"
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Code Preview Block */}
                <div className="mt-3 relative rounded-lg border border-zinc-800/90 bg-[#09090b] p-3 font-mono text-[10.5px] leading-relaxed text-zinc-300 overflow-x-auto max-h-48 scrollbar-thin">
                  <pre className="whitespace-pre"><code>{t.code}</code></pre>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Add / Edit Template Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-[#0d0d0f] p-5 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <Code2 size={16} className="text-[#dfa054]" />
                  <h3 className="text-sm font-bold text-zinc-100">
                    {editingTemplate ? "Edit Code Template" : "New Code Template"}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                >
                  <X size={14} />
                </button>
              </div>

              <form onSubmit={handleSaveModal} className="space-y-3.5 font-sans">
                <div>
                  <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 mb-1">
                    Template Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Fenwick Tree / Modulo Arithmetic"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-[#dfa054]/60 focus:outline-none font-sans"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 mb-1">
                      Language
                    </label>
                    <select
                      value={formLang}
                      onChange={(e) => setFormLang(e.target.value as any)}
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-100 focus:border-[#dfa054]/60 focus:outline-none font-mono"
                    >
                      <option value="cpp">C++</option>
                      <option value="java">Java</option>
                      <option value="python">Python</option>
                      <option value="go">Go</option>
                      <option value="typescript">TypeScript</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 mb-1">
                      Tags (Comma separated)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Graphs, DSU, Math"
                      value={formTags}
                      onChange={(e) => setFormTags(e.target.value)}
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-[#dfa054]/60 focus:outline-none font-sans"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 mb-1">
                    Description (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Short summary or time complexity notes..."
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-[#dfa054]/60 focus:outline-none font-sans"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 mb-1">
                    Code Snippet *
                  </label>
                  <textarea
                    required
                    rows={8}
                    placeholder="Paste code snippet here..."
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-[#09090b] p-3 text-xs text-zinc-200 placeholder-zinc-600 focus:border-[#dfa054]/60 focus:outline-none font-mono scrollbar-thin resize-y"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-zinc-800/80 pt-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg border border-[#dfa054]/50 bg-[#dfa054] px-4 py-1.5 text-xs font-bold text-black hover:bg-[#eab308] transition-colors"
                  >
                    {editingTemplate ? "Save Changes" : "Create Template"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
