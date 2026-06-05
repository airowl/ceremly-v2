/**
 * Composable for the Landing Page Template Editor.
 * Manages full editor state: data, selection, dirty tracking, save/load/AI operations.
 */
import type { LandingPageData, LandingSection, LandingSettings } from "~~/shared/schemas/landing";
import type { LandingSectionType, TemplateCategory } from "~~/shared/constants/enums";
import { SECTION_DEFINITIONS, getSectionDefaults } from "~~/shared/schemas/sections";
import { v7 as uuidv7 } from "uuid";

const DEFAULT_SETTINGS: LandingSettings = {
  primaryColor: "#6366f1",
  secondaryColor: "#10b981",
  backgroundColor: "#ffffff",
  textColor: "#1f2937",
  fontFamily: "inter",
  borderRadius: "md",
};

interface TemplateMeta {
  name: string;
  description: string | null;
  category: TemplateCategory;
}

interface EventTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string;
  data: LandingPageData;
  isSystem: boolean;
  isAiGenerated: boolean;
}

export function useLandingEditor(
  eventId: Ref<string> | string,
  templateId: Ref<string | null> | string | null,
) {
  // ── State ──
  const data = ref<LandingPageData | null>(null);
  const templateMeta = ref<TemplateMeta | null>(null);
  const originalSnapshot = ref("");
  const selectedSectionId = ref<string | null>(null);
  const showGlobalSettings = ref(false);
  const previewMode = ref<"desktop" | "mobile">("desktop");

  const isLoading = ref(false);
  const isSaving = ref(false);
  const isGenerating = ref(false);
  const error = ref<string | null>(null);

  // ── Computed ──
  const isNewTemplate = computed(() => !toValue(templateId));

  const isDirty = computed(() => {
    if (!data.value) return false;
    return JSON.stringify(data.value) !== originalSnapshot.value;
  });

  const sections = computed(() => data.value?.sections ?? []);

  const orderedSections = computed(() =>
    [...sections.value].sort((a, b) => a.order - b.order),
  );

  const enabledSections = computed(() =>
    orderedSections.value.filter((s) => s.enabled),
  );

  const selectedSection = computed(() => {
    if (!selectedSectionId.value) return null;
    return sections.value.find((s) => s.id === selectedSectionId.value) ?? null;
  });

  const selectedSectionDefinition = computed(() => {
    if (!selectedSection.value) return null;
    return (
      SECTION_DEFINITIONS.find(
        (d) => d.type === selectedSection.value!.type,
      ) ?? null
    );
  });

  const availableSectionsToAdd = computed(() => {
    const usedTypes = new Set(sections.value.map((s) => s.type));
    return SECTION_DEFINITIONS.filter((d) => !usedTypes.has(d.type));
  });

  const settings = computed(
    () => data.value?.settings ?? DEFAULT_SETTINGS,
  );

  // ── Actions ──

  function _createDefaultData(): LandingPageData {
    const defaultSections: LandingSectionType[] = [
      "hero",
      "details",
      "countdown",
      "gallery",
      "rsvp",
      "map",
      "footer",
    ];

    return {
      settings: { ...DEFAULT_SETTINGS },
      sections: defaultSections.map((type, index) => ({
        id: uuidv7(),
        type,
        enabled: true,
        order: index,
        values: getSectionDefaults(type),
      })),
    };
  }

  async function load() {
    if (import.meta.server) return;

    const tplId = toValue(templateId);

    try {
      isLoading.value = true;
      error.value = null;

      if (tplId) {
        // Load existing template
        const template = await $fetch<EventTemplate>(`/api/templates/${tplId}`);
        data.value = template.data as LandingPageData;
        templateMeta.value = {
          name: template.name,
          description: template.description,
          category: template.category as TemplateCategory,
        };
      } else {
        // New template — create default data
        data.value = _createDefaultData();
        templateMeta.value = null;
      }

      originalSnapshot.value = JSON.stringify(data.value);

      // Select the first section by order
      if (data.value.sections.length > 0) {
        const sorted = [...data.value.sections].sort((a, b) => a.order - b.order);
        selectedSectionId.value = sorted[0]!.id;
      }
    } catch (err: any) {
      error.value =
        err.message || err.data?.message || "Error loading template data";
      console.error("Error loading template data:", err);
    } finally {
      isLoading.value = false;
    }
  }

  async function save(meta: {
    name: string;
    description?: string | null;
    category: TemplateCategory;
  }) {
    if (import.meta.server) return { success: false };
    if (!data.value) return { success: false };

    const tplId = toValue(templateId);

    try {
      isSaving.value = true;
      error.value = null;

      const body = {
        name: meta.name,
        description: meta.description || undefined,
        category: meta.category,
        data: data.value,
      };

      if (tplId) {
        // Update existing template
        await $fetch(`/api/templates/${tplId}`, {
          method: "PUT",
          body,
        });
      } else {
        // Create new template
        await $fetch("/api/templates", {
          method: "POST",
          body,
        });
      }

      templateMeta.value = {
        name: meta.name,
        description: meta.description ?? null,
        category: meta.category,
      };
      originalSnapshot.value = JSON.stringify(data.value);

      return { success: true };
    } catch (err: any) {
      error.value =
        err.message || err.data?.message || "Error saving template";
      console.error("Error saving template:", err);
      return { success: false, error: error.value };
    } finally {
      isSaving.value = false;
    }
  }

  function selectSection(sectionId: string | null) {
    showGlobalSettings.value = false;
    selectedSectionId.value = sectionId;
  }

  function updateSectionValues(
    sectionId: string,
    values: Record<string, unknown>,
  ) {
    if (!data.value) return;
    const section = data.value.sections.find((s) => s.id === sectionId);
    if (section) {
      section.values = { ...section.values, ...values };
    }
  }

  function toggleSection(sectionId: string, enabled?: boolean) {
    if (!data.value) return;
    const section = data.value.sections.find((s) => s.id === sectionId);
    if (section) {
      section.enabled = enabled ?? !section.enabled;
    }
  }

  function reorderSections(newOrder: LandingSection[]) {
    if (!data.value) return;
    data.value.sections = newOrder.map((s, index) => ({ ...s, order: index }));
  }

  function addSection(type: LandingSectionType) {
    if (!data.value) return;
    if (data.value.sections.some((s) => s.type === type)) return;
    const newSection: LandingSection = {
      id: uuidv7(),
      type,
      enabled: true,
      order: data.value.sections.length,
      values: getSectionDefaults(type),
    };
    data.value.sections.push(newSection);
    selectedSectionId.value = newSection.id;
    showGlobalSettings.value = false;
  }

  function removeSection(sectionId: string) {
    if (!data.value) return;
    data.value.sections = data.value.sections
      .filter((s) => s.id !== sectionId)
      .map((s, index) => ({ ...s, order: index }));
    if (selectedSectionId.value === sectionId) {
      selectedSectionId.value = data.value.sections[0]?.id ?? null;
    }
  }

  function updateSettings(newSettings: Partial<LandingSettings>) {
    if (!data.value) return;
    data.value.settings = { ...data.value.settings, ...newSettings };
  }

  async function generateWithAI(prompt: string, category?: TemplateCategory) {
    if (import.meta.server) return { success: false };
    const id = toValue(eventId);
    if (!id) return { success: false };

    try {
      isGenerating.value = true;
      error.value = null;

      const result = await $fetch<{ data: LandingPageData }>(
        `/api/events/${id}/landing/generate`,
        {
          method: "POST",
          body: { prompt, category },
        },
      );

      data.value = result.data;
      originalSnapshot.value = JSON.stringify(data.value);
      if (result.data.sections.length > 0) {
        const sorted = [...result.data.sections].sort((a, b) => a.order - b.order);
        selectedSectionId.value = sorted[0]!.id;
      }
      return { success: true };
    } catch (err: any) {
      error.value =
        err.message || err.data?.message || "Error generating landing data";
      console.error("Error generating landing data:", err);
      return { success: false, error: error.value };
    } finally {
      isGenerating.value = false;
    }
  }

  return {
    // State
    data,
    templateMeta,
    selectedSectionId,
    showGlobalSettings,
    previewMode,
    isLoading,
    isSaving,
    isGenerating,
    isDirty,
    isNewTemplate,
    error,
    // Computed
    sections,
    orderedSections,
    enabledSections,
    selectedSection,
    selectedSectionDefinition,
    availableSectionsToAdd,
    settings,
    // Actions
    load,
    save,
    selectSection,
    updateSectionValues,
    toggleSection,
    reorderSections,
    addSection,
    removeSection,
    updateSettings,
    generateWithAI,
  };
}
