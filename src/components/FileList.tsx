import { FileText, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
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
    <div className="border rounded-lg overflow-hidden">
      <div className="bg-muted/50 px-4 py-2 border-b">
        <h3 className="font-medium text-sm">Files ({files.length})</h3>
      </div>

      <div className="divide-y">
        {files.map((fileResult, index) => {
          const { file, result, error, loading } = fileResult;
          const isSelected = selectedIndex === index;

          return (
            <div
              key={`${file.name}-${index}`}
              className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                isSelected ? 'bg-primary/5' : 'hover:bg-muted/50'
              }`}
              onClick={() => onSelect(index)}
            >
              <div className="flex-shrink-0">
                {loading ? (
                  <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                ) : error ? (
                  <AlertCircle className="w-5 h-5 text-destructive" />
                ) : result ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <FileText className="w-5 h-5 text-muted-foreground" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {loading
                    ? 'Converting...'
                    : error
                    ? 'Failed'
                    : result
                    ? `${result.markdown.length} chars`
                    : 'Pending'}
                </p>
              </div>

              <button
                onClick={e => {
                  e.stopPropagation();
                  onRemove(index);
                }}
                className="flex-shrink-0 p-1 rounded hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
