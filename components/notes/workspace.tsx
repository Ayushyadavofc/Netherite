"use client"

import { useState } from "react"
import {
  Search,
  Plus,
  FileText,
  Folder,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  Hash,
  Calendar,
  Star,
  Home,
  Layers,
  LogOut,
  Bold,
  Italic,
  List,
  ListOrdered,
  Link as LinkIcon,
  Code,
  Quote,
  Image,
} from "lucide-react"
import Link from "next/link"

interface Note {
  id: string
  title: string
  content: string
  folder?: string
  tags: string[]
  starred: boolean
  updatedAt: string
}

interface FolderItem {
  name: string
  expanded: boolean
  notes: string[]
}

const initialNotes: Note[] = [
  {
    id: "1",
    title: "Binary Search Algorithm",
    content: `# Binary Search Algorithm

Binary search is a search algorithm that finds the position of a target value within a sorted array.

## How it works

1. Compare the target with the middle element
2. If target equals middle element, return the position
3. If target is less than middle, search the left half
4. If target is greater than middle, search the right half

## Time Complexity

- **Best Case**: O(1)
- **Average Case**: O(log n)
- **Worst Case**: O(log n)

## Code Example

\`\`\`python
def binary_search(arr, target):
    left, right = 0, len(arr) - 1
    while left <= right:
        mid = (left + right) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1
\`\`\``,
    folder: "DSA",
    tags: ["algorithms", "search", "important"],
    starred: true,
    updatedAt: "2 hours ago",
  },
  {
    id: "2",
    title: "Process Scheduling",
    content: `# Process Scheduling

Process scheduling is the activity of the process manager that handles the removal of the running process from the CPU and the selection of another process.

## Types of Schedulers

### Long-term Scheduler
Controls the degree of multiprogramming.

### Short-term Scheduler
Selects which process should be executed next.

### Medium-term Scheduler
Handles swapping processes in and out of memory.`,
    folder: "Operating Systems",
    tags: ["os", "processes"],
    starred: false,
    updatedAt: "Yesterday",
  },
  {
    id: "3",
    title: "Quick Notes",
    content: "# Quick Notes\n\nJust some quick thoughts...",
    tags: ["misc"],
    starred: false,
    updatedAt: "3 days ago",
  },
]

const initialFolders: FolderItem[] = [
  { name: "DSA", expanded: true, notes: ["1"] },
  { name: "Operating Systems", expanded: false, notes: ["2"] },
]

export function Workspace() {
  const [notes, setNotes] = useState<Note[]>(initialNotes)
  const [folders, setFolders] = useState<FolderItem[]>(initialFolders)
  const [selectedNote, setSelectedNote] = useState<Note | null>(initialNotes[0])
  const [searchQuery, setSearchQuery] = useState("")
  const [editedContent, setEditedContent] = useState(initialNotes[0]?.content || "")

  const toggleFolder = (folderName: string) => {
    setFolders(
      folders.map((f) =>
        f.name === folderName ? { ...f, expanded: !f.expanded } : f
      )
    )
  }

  const selectNote = (note: Note) => {
    setSelectedNote(note)
    setEditedContent(note.content)
  }

  const updateNoteContent = (content: string) => {
    setEditedContent(content)
    if (selectedNote) {
      setNotes(
        notes.map((n) =>
          n.id === selectedNote.id ? { ...n, content, updatedAt: "Just now" } : n
        )
      )
    }
  }

  const createNote = () => {
    const newNote: Note = {
      id: Date.now().toString(),
      title: "Untitled Note",
      content: "# Untitled Note\n\nStart writing...",
      tags: [],
      starred: false,
      updatedAt: "Just now",
    }
    setNotes([newNote, ...notes])
    selectNote(newNote)
  }

  const filteredNotes = notes.filter(
    (note) =>
      note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.content.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const unfolderedNotes = filteredNotes.filter((n) => !n.folder)

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      {/* Left Sidebar - File Tree */}
      <aside className="w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col">
        {/* Sidebar Header */}
        <div className="p-4 border-b border-zinc-800">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-amber-500 text-xl">&#x2B21;</span>
            <span className="text-amber-500 font-semibold">Notes</span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-500/50"
            />
          </div>
        </div>

        {/* Quick Links */}
        <div className="p-2 border-b border-zinc-800">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-3 py-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <Home className="w-4 h-4" />
            <span className="text-sm">Dashboard</span>
          </Link>
          <Link
            href="/flashcards"
            className="flex items-center gap-2 px-3 py-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <Layers className="w-4 h-4" />
            <span className="text-sm">Flashcards</span>
          </Link>
        </div>

        {/* File Tree */}
        <div className="flex-1 overflow-auto p-2">
          {/* New Note Button */}
          <button
            onClick={createNote}
            className="w-full flex items-center gap-2 px-3 py-2 text-amber-500 hover:bg-amber-500/10 rounded-lg transition-colors mb-2"
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm font-medium">New Note</span>
          </button>

          {/* Folders */}
          {folders.map((folder) => (
            <div key={folder.name} className="mb-1">
              <button
                onClick={() => toggleFolder(folder.name)}
                className="w-full flex items-center gap-2 px-3 py-2 text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                {folder.expanded ? (
                  <ChevronDown className="w-4 h-4 text-zinc-500" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-zinc-500" />
                )}
                <Folder className="w-4 h-4 text-amber-500/70" />
                <span className="text-sm">{folder.name}</span>
              </button>
              {folder.expanded && (
                <div className="ml-4">
                  {filteredNotes
                    .filter((n) => n.folder === folder.name)
                    .map((note) => (
                      <button
                        key={note.id}
                        onClick={() => selectNote(note)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                          selectedNote?.id === note.id
                            ? "bg-amber-500/10 text-amber-500"
                            : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                        }`}
                      >
                        <FileText className="w-4 h-4" />
                        <span className="text-sm truncate">{note.title}</span>
                        {note.starred && (
                          <Star className="w-3 h-3 text-amber-500 ml-auto" />
                        )}
                      </button>
                    ))}
                </div>
              )}
            </div>
          ))}

          {/* Unfoldered Notes */}
          {unfolderedNotes.length > 0 && (
            <div className="mt-2 pt-2 border-t border-zinc-800">
              {unfolderedNotes.map((note) => (
                <button
                  key={note.id}
                  onClick={() => selectNote(note)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                    selectedNote?.id === note.id
                      ? "bg-amber-500/10 text-amber-500"
                      : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  <span className="text-sm truncate">{note.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar Footer */}
        <div className="p-2 border-t border-zinc-800">
          <Link
            href="/"
            className="flex items-center gap-2 px-3 py-2 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm">Exit Vault</span>
          </Link>
        </div>
      </aside>

      {/* Main Editor */}
      <main className="flex-1 flex flex-col">
        {selectedNote ? (
          <>
            {/* Editor Header */}
            <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={selectedNote.title}
                  onChange={(e) => {
                    setNotes(
                      notes.map((n) =>
                        n.id === selectedNote.id
                          ? { ...n, title: e.target.value }
                          : n
                      )
                    )
                    setSelectedNote({ ...selectedNote, title: e.target.value })
                  }}
                  className="text-xl font-semibold bg-transparent border-none outline-none text-zinc-100"
                />
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-zinc-500 text-sm">
                  <Calendar className="w-4 h-4" />
                  <span>{selectedNote.updatedAt}</span>
                </div>
                <button className="text-zinc-500 hover:text-zinc-300 transition-colors">
                  <MoreHorizontal className="w-5 h-5" />
                </button>
              </div>
            </header>

            {/* Toolbar */}
            <div className="flex items-center gap-1 px-6 py-2 border-b border-zinc-800">
              <ToolbarButton icon={Bold} />
              <ToolbarButton icon={Italic} />
              <div className="w-px h-5 bg-zinc-700 mx-2" />
              <ToolbarButton icon={List} />
              <ToolbarButton icon={ListOrdered} />
              <div className="w-px h-5 bg-zinc-700 mx-2" />
              <ToolbarButton icon={LinkIcon} />
              <ToolbarButton icon={Code} />
              <ToolbarButton icon={Quote} />
              <ToolbarButton icon={Image} />
            </div>

            {/* Editor Content */}
            <div className="flex-1 overflow-auto p-6">
              <textarea
                value={editedContent}
                onChange={(e) => updateNoteContent(e.target.value)}
                className="w-full h-full bg-transparent text-zinc-300 leading-relaxed resize-none outline-none font-mono text-sm"
                placeholder="Start writing..."
              />
            </div>

            {/* Tags */}
            {selectedNote.tags.length > 0 && (
              <div className="flex items-center gap-2 px-6 py-3 border-t border-zinc-800">
                <Hash className="w-4 h-4 text-zinc-500" />
                {selectedNote.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-1 bg-zinc-800 text-zinc-400 text-xs rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-500">
            <div className="text-center">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Select a note or create a new one</p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function ToolbarButton({ icon: Icon }: { icon: typeof Bold }) {
  return (
    <button className="p-2 text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 rounded transition-colors">
      <Icon className="w-4 h-4" />
    </button>
  )
}
