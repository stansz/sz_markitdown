import { useCallback, useState } from 'react';
import { Upload, FileText } from 'lucide-react';

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
}

export function FileUpload({ onFilesSelected }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        onFilesSelected(files);
      }
    },
    [onFilesSelected]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        onFilesSelected(files);
      }
      // Reset input so same file can be selected again
      e.target.value = '';
    },
    [onFilesSelected]
  );

  return (
    <div
      className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
        isDragging
          ? 'border-primary bg-primary/5'
          : 'border-muted-foreground/25 hover:border-primary/50'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        type="file"
        multiple
        accept=".pdf,.docx,.xlsx,.xls,.pptx,.html,.htm"
        onChange={handleFileInput}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />

      <div className="flex flex-col items-center gap-4">
        <div className="p-4 rounded-full bg-muted">
          {isDragging ? (
            <FileText className="w-8 h-8 text-primary" />
          ) : (
            <Upload className="w-8 h-8 text-muted-foreground" />
          )}
        </div>

        <div>
          <p className="text-lg font-medium">
            {isDragging ? 'Drop files here' : 'Drag & drop files here'}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            or click to browse
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2 mt-2">
          {['PDF', 'DOCX', 'XLSX', 'PPTX', 'HTML'].map(format => (
            <span
              key={format}
              className="px-2 py-1 text-xs rounded-full bg-muted text-muted-foreground"
            >
              {format}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
