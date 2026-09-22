import { useConvexMutation, useConvexQuery } from "convex-vue";
import { api } from "~~/convex/_generated/api";
import { useConvexError } from "~/composables/useConvexError";
import type {
    CreateProjectInput,
    UpdateProjectInput,
    ProjectStatus,
} from "~~/shared/schemas/project";

/**
 * Righello dell'API progetti Convex, nella forma che la UI conosceva.
 *
 * `id` è `_id`, le date sono ISO: la pagina formatta con `new Date(...)` e
 * `date-fns`, quindi la conversione da millisecondi Convex sta qui e non nel
 * template. `description` resta `null` (Convex rappresenta "vuoto" con il campo
 * assente) perché è quello che la UI legge per mostrare il placeholder.
 */
export interface ProjectItem {
    id: string;
    organizationId: string;
    name: string;
    description: string | null;
    status: ProjectStatus;
    createdAt: string;
    updatedAt: string;
}

interface ConvexProjectRow {
    _id: string;
    organizationId: string;
    name: string;
    /** Lo schema lo dichiara `v.string()`: la union la applica la mutation, non la lettura. */
    status: string;
    description?: string;
    createdAt: number;
    updatedAt: number;
}

/**
 * `status` è ristretto in lettura, non solo in scrittura: le righe possono anche
 * arrivare dall'import legacy, e un valore inatteso deve degradare su `active`
 * (comportamento del vecchio repository) invece di entrare in un tipo che mente.
 */
export function toProjectStatus(status: string): ProjectStatus {
    return status === "archived" ? "archived" : "active";
}

export function toProjectItem(row: ConvexProjectRow): ProjectItem {
    return {
        id: row._id,
        organizationId: row.organizationId,
        name: row.name,
        description: row.description ?? null,
        status: toProjectStatus(row.status),
        createdAt: new Date(row.createdAt).toISOString(),
        updatedAt: new Date(row.updatedAt).toISOString(),
    };
}

/**
 * useProjects — Task 14, primo vertical slice.
 *
 * Tre differenze rispetto alla versione `$fetch`, tutte volute:
 *
 * 1. **La lista è una query viva.** Prima: `useAsyncData` + `refresh()` dopo
 *    ogni scrittura. Ora la lista si aggiorna da sola, anche se a scrivere è
 *    un'altra scheda dello stesso utente — è il motivo per cui il port esiste.
 * 2. **`list()` non esiste più.** Restituire una Promise avrebbe voluto dire
 *    `useConvexClient().query(...)`, cioè rinunciare al punto 1. Chi legge usa
 *    `projects`, chi scrive usa le mutation.
 * 3. **`truncated` è esposto.** La query ha un tetto dichiarato (`listAll`);
 *    la UI può dirlo invece di mostrare un elenco che sembra completo.
 *
 * `create`/`update`/`remove` restano Promise-based: le pagine le `await`ano per
 * mostrare il toast, e una mutation Convex è già una Promise.
 */
export function useProjects() {
    const {
        data,
        error: queryError,
        isPending,
    } = useConvexQuery(api.projects.listAll, {}, { server: false });

    const createMutation = useConvexMutation(api.projects.create);
    const updateMutation = useConvexMutation(api.projects.update);
    const removeMutation = useConvexMutation(api.projects.remove);

    const isLoading = computed(() => isPending.value || createMutation.isPending.value
        || updateMutation.isPending.value || removeMutation.isPending.value);

    const projects = computed<ProjectItem[]>(
        () => (data.value?.projects ?? []).map(toProjectItem),
    );
    const truncated = computed(() => data.value?.truncated ?? false);

    const error = useConvexError(queryError);

    async function create(input: CreateProjectInput): Promise<void> {
        await createMutation.mutate({ input });
    }

    async function update(id: string, input: UpdateProjectInput): Promise<void> {
        await updateMutation.mutate({
            // `id` arriva dalla UI come stringa: la conversione a Id<"projects">
            // è il confine di tipo fra il DOM e Convex, in un punto solo.
            projectId: id as never,
            input,
        });
    }

    async function remove(id: string): Promise<void> {
        await removeMutation.mutate({ projectId: id as never });
    }

    return { projects, truncated, isLoading, error, create, update, remove };
}
