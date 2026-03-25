import { useState, useEffect } from 'react'
import { FileUpload } from './components/FileUpload'
import { FileList } from './components/FileList'
import { MarkdownPreview } from './components/MarkdownPreview'
import { ActionButtons } from './components/ActionButtons'
import { MarkItDown } from './core/MarkItDown'
import type { DocumentConverterResult } from './core/types'

interface FileResult {
  file: File
  result: DocumentConverterResult | null
  error: string | null
  loading: boolean
}

function App() {
  const [files, setFiles] = useState<FileResult[]>([])
  const [selectedFileIndex, setSelectedFileIndex] = useState<number | null>(null)
  const [converter] = useState(() => new MarkItDown())
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return false
  })

  // Handle dark mode class on document
  useEffect(() => {
    const root = window.document.documentElement
    if (darkMode) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }, [darkMode])

  const handleFilesSelected = async (selectedFiles: File[]) => {
    const newFiles: FileResult[] = selectedFiles.map(file => ({
      file,
      result: null,
      error: null,
      loading: true,
    }))

    setFiles(prev => [...prev, ...newFiles])
    const startIndex = files.length

    // Process each file
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i]
      const index = startIndex + i

      try {
        const result = await converter.convert(file)
        setFiles(prev => {
          const updated = [...prev]
          updated[index] = { ...updated[index], result, loading: false }
          return updated
        })

        // Auto-select first successful conversion
        if (selectedFileIndex === null) {
          setSelectedFileIndex(index)
        }
      } catch (err) {
        setFiles(prev => {
          const updated = [...prev]
          updated[index] = {
            ...updated[index],
            error: err instanceof Error ? err.message : 'Conversion failed',
            loading: false,
          }
          return updated
        })
      }
    }
  }

  const handleRemoveFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
    if (selectedFileIndex === index) {
      setSelectedFileIndex(files.length > 1 ? 0 : null)
    } else if (selectedFileIndex !== null && selectedFileIndex > index) {
      setSelectedFileIndex(selectedFileIndex - 1)
    }
  }

  const selectedFile = selectedFileIndex !== null ? files[selectedFileIndex] : null

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header with gradient accent */}
      <header className="relative border-b bg-card/60 backdrop-blur-md">
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
        <div className="container mx-auto px-4 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="p-3 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20">
                  <svg 
                    className="w-8 h-8 text-primary" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor" 
                    strokeWidth={1.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </div>
                <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-green-500 border-2 border-card animate-pulse" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                  MarkItDown
                </h1>
                <p className="text-sm text-muted-foreground/80">
                  Convert documents to Markdown — 100% client-side
                </p>
              </div>
            </div>
            
            {/* Dark mode toggle */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="group p-2.5 rounded-xl bg-muted/40 hover:bg-muted border border-transparent hover:border-primary/20 transition-all duration-300 hover:scale-105"
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? (
                <svg className="w-5 h-5 text-foreground/80 group-hover:text-foreground transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-foreground/80 group-hover:text-foreground transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left Panel - Upload and File List */}
          <div className="lg:col-span-2 space-y-5">
            <FileUpload onFilesSelected={handleFilesSelected} />
            
            {files.length > 0 && (
              <FileList
                files={files}
                selectedIndex={selectedFileIndex}
                onSelect={setSelectedFileIndex}
                onRemove={handleRemoveFile}
              />
            )}
          </div>

          {/* Right Panel - Preview and Actions */}
          <div className="lg:col-span-3">
            {selectedFile?.result ? (
              <div className="space-y-5">
                <ActionButtons
                  markdown={selectedFile.result.markdown}
                  filename={selectedFile.file.name}
                />
                <MarkdownPreview markdown={selectedFile.result.markdown} />
              </div>
            ) : selectedFile?.loading ? (
              <div className="h-full min-h-[400px] flex items-center justify-center">
                <div className="text-center p-8 rounded-2xl bg-card border shadow-sm">
                  <div className="relative w-16 h-16 mx-auto mb-4">
                    <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
                    <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                  </div>
                  <p className="text-muted-foreground font-medium">Converting document...</p>
                  <p className="text-sm text-muted-foreground/70 mt-1">{selectedFile.file.name}</p>
                </div>
              </div>
            ) : selectedFile?.error ? (
              <div className="h-full min-h-[400px] flex items-center justify-center">
                <div className="text-center p-8 rounded-2xl bg-destructive/5 border border-destructive/20 shadow-sm max-w-sm">
                  <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-7 h-7 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                  </div>
                  <p className="font-semibold text-destructive">Conversion Failed</p>
                  <p className="text-sm text-muted-foreground mt-2">{selectedFile.error}</p>
                </div>
              </div>
            ) : (
              <div className="h-full min-h-[400px] flex items-center justify-center">
                <div className="text-center p-8 rounded-2xl bg-card/50 border border-dashed shadow-sm">
                  <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                    </svg>
                  </div>
                  <p className="text-muted-foreground font-medium">
                    Select a file to preview
                  </p>
                  <p className="text-sm text-muted-foreground/60 mt-1">
                    Your Markdown will appear here
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="border-t bg-card/50">
        <div className="container mx-auto px-4 py-4 text-center">
          <p className="text-sm text-muted-foreground">
            Browser-based version of{' '}
            <a
              href="https://github.com/microsoft/markitdown"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-medium"
            >
              Microsoft MarkItDown
            </a>
            
          </p>
        </div>
      </footer>
    </div>
  )
}

export default App
