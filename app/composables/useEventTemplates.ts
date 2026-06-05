/**
 * Composable for event template management.
 * Handles CRUD, AI generation, and applying templates to events.
 */
import type { TemplateCategory } from "~~/shared/constants/enums";

interface EventTemplate {
  id: string;
  userId: string | null;
  name: string;
  description: string | null;
  category: string;
  data: Record<string, unknown>;
  thumbnailUrl: string | null;
  isSystem: boolean;
  isAiGenerated: boolean;
  createdAt: string;
  updatedAt: string;
}

export function useEventTemplates() {
  const templates = ref<EventTemplate[]>([]);
  const isLoading = ref(false);
  const isGenerating = ref(false);
  const error = ref<string | null>(null);

  async function loadTemplates(filters?: { category?: TemplateCategory }) {
    if (import.meta.server) return;

    try {
      isLoading.value = true;
      error.value = null;

      const query: Record<string, string> = {};
      if (filters?.category) query.category = filters.category;

      const data = await $fetch<{ templates: EventTemplate[] }>("/api/templates", {
        query,
      });

      templates.value = data.templates;
    } catch (err: any) {
      error.value = err.message || err.data?.message || "Error loading templates";
      console.error("Error loading templates:", err);
    } finally {
      isLoading.value = false;
    }
  }

  async function generateTemplate(prompt: string, category?: TemplateCategory) {
    if (import.meta.server) return { success: false, error: "Not available on server" };

    try {
      isGenerating.value = true;
      error.value = null;

      const template = await $fetch<EventTemplate>("/api/templates/generate", {
        method: "POST",
        body: { prompt, category },
      });

      templates.value.unshift(template);

      return { success: true, template };
    } catch (err: any) {
      error.value = err.message || err.data?.message || "Error generating template";
      console.error("Error generating template:", err);
      return { success: false, error: error.value };
    } finally {
      isGenerating.value = false;
    }
  }

  async function deleteTemplate(templateId: string) {
    if (import.meta.server) return { success: false };

    try {
      error.value = null;

      await $fetch(`/api/templates/${templateId}`, {
        method: "DELETE",
      });

      templates.value = templates.value.filter((t) => t.id !== templateId);

      return { success: true };
    } catch (err: any) {
      error.value = err.message || err.data?.message || "Error deleting template";
      console.error("Error deleting template:", err);
      return { success: false, error: error.value };
    }
  }

  async function applyTemplate(eventId: string, templateId: string) {
    if (import.meta.server) return { success: false };

    try {
      error.value = null;

      const result = await $fetch<{ success: boolean; landingPageId: string }>(
        `/api/events/${eventId}/templates/apply`,
        {
          method: "POST",
          body: { templateId },
        },
      );

      return { success: true, landingPageId: result.landingPageId };
    } catch (err: any) {
      error.value = err.message || err.data?.message || "Error applying template";
      console.error("Error applying template:", err);
      return { success: false, error: error.value };
    }
  }

  return {
    templates,
    isLoading,
    isGenerating,
    error,
    loadTemplates,
    generateTemplate,
    deleteTemplate,
    applyTemplate,
  };
}
