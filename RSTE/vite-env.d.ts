/// <reference types="vite/client" />

interface FileSystemDirectoryHandle {
    getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
}

interface FileSystemFileHandle {
    createWritable(): Promise<FileSystemWritableFileStream>;
}

interface FileSystemWritableFileStream extends WritableStream {
    write(data: string | ArrayBuffer | Blob): Promise<void>;
    close(): Promise<void>;
}

interface Window {
    showDirectoryPicker(): Promise<FileSystemDirectoryHandle>;
    showSaveFilePicker(options?: any): Promise<FileSystemFileHandle>;
}
