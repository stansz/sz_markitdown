import { useState } from 'react'
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
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold tracking-tight">MarkItDown Browser</h1>
          <p className="text-muted-foreground mt-2">
            Convert documents to Markdown entirely in your browser. No server required.
          </p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Panel - Upload and File List */}
          <div className="space-y-6">
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
          <div className="space-y-6">
            {selectedFile?.result ? (
              <>
                <ActionButtons
                  markdown={selectedFile.result.markdown}
                  filename={selectedFile.file.name}
                />
                <MarkdownPreview markdown={selectedFile.result.markdown} />
              </>
            ) : selectedFile?.loading ? (
              <div className="flex items-center justify-center h-64 border rounded-lg bg-muted/50">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  <p className="mt-4 text-muted-foreground">Converting...</p>
                </div>
              </div>
            ) : selectedFile?.error ? (
              <div className="flex items-center justify-center h-64 border rounded-lg bg-destructive/10">
                <div className="text-center text-destructive">
                  <p className="font-semibold">Conversion Failed</p>
                  <p className="mt-2 text-sm">{selectedFile.error}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 border rounded-lg bg-muted/50">
                <p className="text-muted-foreground">
                  Select a file to preview the converted Markdown
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="border-t mt-auto">
        <div className="container mx-auto px-4 py-6 text-center text-sm text-muted-foreground">
          <p>
            Browser-based version of{' '}
            <a
              href="https://github.com/microsoft/markitdown"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              Microsoft MarkItDown
            </a>
            . All processing happens locally in your browser.
          </p>
        </div>
      </footer>
    </div>
  )
}

export default App
