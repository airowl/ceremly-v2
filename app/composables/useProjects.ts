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
    const isLoading = ref(false);
    const error = ref<string | null>(null);

    async function list(): Promise<ProjectItem[]> {
        if (import.meta.server) return [];
        isLoading.value = true;
        error.value = null;
        try {
            const res = await $fetch<{ projects: ProjectItem[] }>("/api/projects");
            return res.projects ?? [];
        } catch (e: any) {
            error.value = e.data?.message || e.message || "Errore nel caricamento";
            throw e;
        } finally {
            isLoading.value = false;
        }
    }

    async function create(data: CreateProjectInput): Promise<ProjectItem> {
        isLoading.value = true;
        error.value = null;
        try {
            const res = await $fetch<{ project: ProjectItem }>("/api/projects", {
                method: "POST",
                body: data,
            });
            return res.project;
        } catch (e: any) {
            error.value = e.data?.message || e.message || "Errore nella creazione";
            throw e;
        } finally {
            isLoading.value = false;
        }
    }

    async function update(id: string, data: UpdateProjectInput): Promise<ProjectItem> {
        isLoading.value = true;
        error.value = null;
        try {
            const res = await $fetch<{ project: ProjectItem }>(`/api/projects/${id}`, {
                method: "PUT",
                body: data,
            });
            return res.project;
        } catch (e: any) {
            error.value = e.data?.message || e.message || "Errore nell'aggiornamento";
            throw e;
        } finally {
            isLoading.value = false;
        }
    }

    async function remove(id: string): Promise<void> {
        isLoading.value = true;
        error.value = null;
        try {
            await $fetch(`/api/projects/${id}`, { method: "DELETE" });
        } catch (e: any) {
            error.value = e.data?.message || e.message || "Errore nell'eliminazione";
            throw e;
        } finally {
            isLoading.value = false;
        }
    }

    return { isLoading, error, list, create, update, remove };
}
