import type {
    CreateProjectInput,
    UpdateProjectInput,
    ProjectStatus,
} from "~~/shared/schemas/project";

export interface ProjectItem {
    id: string;
    organizationId: string;
    name: string;
    description: string | null;
    status: ProjectStatus;
    createdAt: string;
    updatedAt: string;
}

export function useProjects() {
    // Toast gestiti dalle pagine (possiedono le chiavi i18n) → errorToast: false.
    const { isLoading, error, run } = useApi();

    async function list(): Promise<ProjectItem[]> {
        if (import.meta.server) return [];
        const res = await run(
            () => $fetch<{ projects: ProjectItem[] }>("/api/projects"),
            { fallback: "Errore nel caricamento", errorToast: false },
        );
        return res.projects ?? [];
    }

    async function create(data: CreateProjectInput): Promise<ProjectItem> {
        const res = await run(
            () => $fetch<{ project: ProjectItem }>("/api/projects", { method: "POST", body: data }),
            { fallback: "Errore nella creazione", errorToast: false },
        );
        return res.project;
    }

    async function update(id: string, data: UpdateProjectInput): Promise<ProjectItem> {
        const res = await run(
            () => $fetch<{ project: ProjectItem }>(`/api/projects/${id}`, { method: "PUT", body: data }),
            { fallback: "Errore nell'aggiornamento", errorToast: false },
        );
        return res.project;
    }

    async function remove(id: string): Promise<void> {
        await run(
            () => $fetch(`/api/projects/${id}`, { method: "DELETE" }),
            { fallback: "Errore nell'eliminazione", errorToast: false },
        );
    }

    return { isLoading, error, list, create, update, remove };
}
