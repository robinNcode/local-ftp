export const API = {
  upload: async (file) => {
    const form = new FormData();
    form.append("file", file);
    return fetch("/upload", { method: "POST", body: form });
  },

  list: async () => (await fetch("/files")).json(),

  delete: async (name) => fetch(`/delete/${name}`, { method: "DELETE" }),

  download: (name) => window.open(`/download/${name}`, "_blank")
};
