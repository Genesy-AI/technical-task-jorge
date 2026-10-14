import { FC, RefObject, useMemo, useState } from 'react'
import { LeadsGetManyOutput } from '../api/types/leads/getMany'
import { TemplateField } from '../api/types/templates/fields'

type Lead = LeadsGetManyOutput[number]

interface TemplateEditorProps {
  value: string
  onChange: (value: string) => void
  textareaRef: RefObject<HTMLTextAreaElement>
  fields: TemplateField[]
  leads: Lead[]
}

const VARIABLE_REGEX = /(\{\w+\})/g
const MAX_SUGGESTIONS = 8

const matchesQuery = (field: TemplateField, query: string) => {
  const q = query.toLowerCase()
  return field.key.toLowerCase().includes(q) || field.label.toLowerCase().includes(q)
}

const getLeadValue = (lead: Lead, key: string): string | null => {
  const value = (lead as Record<string, unknown>)[key]
  return value === null || value === undefined || value === '' ? null : String(value)
}

const getTemplateVariables = (template: string) =>
  Array.from(new Set(Array.from(template.matchAll(/\{(\w+)\}/g), (m) => m[1])))

export const TemplateEditor: FC<TemplateEditorProps> = ({ value, onChange, textareaRef, fields, leads }) => {
  const [search, setSearch] = useState('')
  const [caret, setCaret] = useState(0)
  const [activeSuggestion, setActiveSuggestion] = useState(0)
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false)
  const [previewLeadId, setPreviewLeadId] = useState<number | null>(null)

  const fieldsByKey = useMemo(() => new Map(fields.map((field) => [field.key, field])), [fields])

  const groupedFields = useMemo(() => {
    const groups = new Map<string, TemplateField[]>()
    fields
      .filter((field) => matchesQuery(field, search))
      .forEach((field) => groups.set(field.group, [...(groups.get(field.group) ?? []), field]))
    return Array.from(groups.entries())
  }, [fields, search])

  // Autocomplete: active while the caret sits right after an unclosed "{partial"
  const autocompleteQuery = value.slice(0, caret).match(/\{(\w*)$/)?.[1] ?? null
  const suggestions = useMemo(
    () =>
      autocompleteQuery === null
        ? []
        : fields.filter((field) => matchesQuery(field, autocompleteQuery)).slice(0, MAX_SUGGESTIONS),
    [fields, autocompleteQuery]
  )
  const showSuggestions = !suggestionsDismissed && suggestions.length > 0

  const variables = getTemplateVariables(value)
  const unknownVariables = variables.filter((key) => !fieldsByKey.has(key))
  const leadsWithMissingValues = leads.filter((lead) =>
    variables.some((key) => fieldsByKey.has(key) && getLeadValue(lead, key) === null)
  )
  const previewLead = leads.find((lead) => lead.id === previewLeadId) ?? leads[0]

  const syncCaret = () => setCaret(textareaRef.current?.selectionStart ?? 0)

  const replaceRange = (start: number, end: number, text: string) => {
    onChange(value.slice(0, start) + text + value.slice(end))
    const nextCaret = start + text.length
    setCaret(nextCaret)
    setTimeout(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret)
    }, 0)
  }

  const insertField = (key: string) => {
    const textarea = textareaRef.current
    replaceRange(textarea?.selectionStart ?? value.length, textarea?.selectionEnd ?? value.length, `{${key}}`)
  }

  const applySuggestion = (key: string) => {
    if (autocompleteQuery === null) return
    replaceRange(caret - autocompleteQuery.length - 1, caret, `{${key}}`)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showSuggestions) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const delta = e.key === 'ArrowDown' ? 1 : -1
      setActiveSuggestion((i) => (i + delta + suggestions.length) % suggestions.length)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      applySuggestion(suggestions[Math.min(activeSuggestion, suggestions.length - 1)].key)
    } else if (e.key === 'Escape') {
      // Close the suggestions only, not the whole modal
      e.stopPropagation()
      setSuggestionsDismissed(true)
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_14rem] gap-4">
      <div className="space-y-3 min-w-0">
        <div className="relative">
          <textarea
            ref={textareaRef}
            id="message-template"
            value={value}
            onChange={(e) => {
              onChange(e.target.value)
              setCaret(e.target.selectionStart)
              setActiveSuggestion(0)
              setSuggestionsDismissed(false)
            }}
            onKeyDown={handleKeyDown}
            onKeyUp={syncCaret}
            onClick={syncCaret}
            onBlur={() => setTimeout(() => setSuggestionsDismissed(true), 150)}
            onFocus={() => setSuggestionsDismissed(false)}
            placeholder="Hi {firstName}, I noticed you've been at {companyName} for {yearsAtCompany} years...&#10;&#10;Type { to insert a field."
            className="w-full h-40 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none font-mono text-sm"
            required
          />
          {showSuggestions && (
            <ul className="absolute left-2 right-2 top-full -mt-1 z-10 bg-white border border-gray-200 rounded-md shadow-lg py-1 max-h-60 overflow-auto">
              {suggestions.map((field, index) => (
                <li key={field.key}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applySuggestion(field.key)}
                    className={`w-full flex items-center justify-between px-3 py-1.5 text-left text-sm ${
                      index === activeSuggestion ? 'bg-blue-50 text-blue-900' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span>{field.label}</span>
                    <code className="text-xs text-gray-500">{`{${field.key}}`}</code>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {unknownVariables.length > 0 && (
          <p className="text-sm text-red-600">
            Unknown field{unknownVariables.length > 1 ? 's' : ''}: {unknownVariables.map((v) => `{${v}}`).join(', ')}
          </p>
        )}
        {leadsWithMissingValues.length > 0 && (
          <p className="text-sm text-amber-700">
            {leadsWithMissingValues.length} of {leads.length} selected lead{leads.length !== 1 ? 's are' : ' is'}{' '}
            missing a value used in this template and will be skipped.
          </p>
        )}

        {previewLead && value.trim() && (
          <div className="border border-gray-200 rounded-md">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50">
              <span className="text-xs font-medium text-gray-500 uppercase">Preview</span>
              {leads.length > 1 && (
                <select
                  value={previewLead.id}
                  onChange={(e) => setPreviewLeadId(Number(e.target.value))}
                  className="text-xs border border-gray-300 rounded px-1 py-0.5 max-w-[12rem]"
                >
                  {leads.map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {lead.firstName} {lead.lastName ?? ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <p className="px-3 py-2 text-sm text-gray-800 whitespace-pre-wrap break-words">
              {value.split(VARIABLE_REGEX).map((part, index) => {
                const key = part.match(/^\{(\w+)\}$/)?.[1]
                if (!key) return part
                if (!fieldsByKey.has(key)) {
                  return (
                    <mark key={index} className="bg-red-100 text-red-700 rounded px-0.5" title="Unknown field">
                      {part}
                    </mark>
                  )
                }
                const fieldValue = getLeadValue(previewLead, key)
                return fieldValue === null ? (
                  <mark key={index} className="bg-amber-100 text-amber-800 rounded px-0.5" title="Missing for this lead">
                    {part}
                  </mark>
                ) : (
                  <mark key={index} className="bg-blue-50 text-blue-900 rounded px-0.5" title={`{${key}}`}>
                    {fieldValue}
                  </mark>
                )
              })}
            </p>
          </div>
        )}
      </div>

      <div className="border border-gray-200 rounded-md flex flex-col max-h-80">
        <div className="p-2 border-b border-gray-200">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search fields..."
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="overflow-y-auto py-1">
          {groupedFields.length === 0 && <p className="px-3 py-2 text-sm text-gray-500">No matching fields</p>}
          {groupedFields.map(([group, groupFields]) => (
            <div key={group}>
              <div className="px-3 pt-2 pb-1 text-xs font-medium text-gray-400 uppercase">{group}</div>
              {groupFields.map((field) => (
                <button
                  key={field.key}
                  type="button"
                  onClick={() => insertField(field.key)}
                  title={`Insert {${field.key}} — e.g. ${field.example}`}
                  className="w-full flex items-center justify-between px-3 py-1 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-900"
                >
                  <span className="truncate">{field.label}</span>
                  <span className="text-blue-600 text-xs">+</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
