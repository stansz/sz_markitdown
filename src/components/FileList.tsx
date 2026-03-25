import { Loader2 } from 'lucide-react';
import type { DocumentConverterResult } from '../core/types';

interface FileResult {
  file: File;
  result: DocumentConverterResult | null;
  error: string | null;
  loading: boolean;
}

interface FileListProps {
  files: FileResult[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onRemove: (index: number) => void;
}

export function FileList({ files, selectedIndex, onSelect, onRemove }: FileListProps) {
  if (files.length === 0) return null;

  return (
    <div className="border rounded-xl overflow-hidden shadow-sm bg-card">
      <div className="bg-muted/40 px-4 py-3 border-b flex items-center justify-between">
        <h3 className="font-semibold text-sm">Files ({files.length})</h3>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
          {files.length} {files.length === 1 ? 'file' : 'files'}
        </span>
      </div>

      <div className="divide-y divide-border/50">
        {files.map((fileResult, index) => {
          const { file, result, error, loading } = fileResult;
          const isSelected = selectedIndex === index;

          return (
            <div
              key={`${file.name}-${index}`}
              className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-all duration-200 ${
                isSelected 
                  ? 'bg-primary/8 border-l-2 border-l-primary' 
                  : 'hover:bg-muted/50 border-l-2 border-l-transparent'
              }`}
              onClick={() => onSelect(index)}
            >
              <div className="flex-shrink-0">
                {loading ? (
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  </div>
                ) : error ? (
                  <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                  </div>
                ) : result ? (
                  <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                    <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {loading
                    ? 'Converting...'
                    : error
                    ? 'Failed'
                    : result
                    ? `${result.markdown.length.toLocaleString()} characters`
                    : 'Pending'}
                </p>
              </div>

              <button
                onClick={e => {
                  e.stopPropagation();
                  onRemove(index);
                }}
                className="flex-shrink-0 p-2 rounded-lg hover:bg-muted transition-colors opacity-60 hover:opacity-100"
              >
                <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
