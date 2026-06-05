import { getExportByToken } from "~~/server/utils/dataExport";

export default defineEventHandler(async (event) => {
    const token = getRouterParam(event, "token");

    if (!token) {
        throw createError({
            statusCode: 400,
            statusMessage: "Download token is required",
        });
    }

    // Get export by token
    const dataExport = await getExportByToken(token);

    if (!dataExport) {
        throw createError({
            statusCode: 404,
            statusMessage: "Export not found or expired",
        });
    }

    // Check if expired
    if (dataExport.expiresAt && new Date(dataExport.expiresAt) < new Date()) {
        throw createError({
            statusCode: 410,
            statusMessage: "This download link has expired",
        });
    }

    if (!dataExport.downloadUrl) {
        throw createError({
            statusCode: 404,
            statusMessage: "Export file not available",
        });
    }

    // If using base64 data URL, decode and return
    if (dataExport.downloadUrl.startsWith("data:application/json;base64,")) {
        const base64Data = dataExport.downloadUrl.replace("data:application/json;base64,", "");
        const jsonContent = Buffer.from(base64Data, "base64").toString("utf8");

        // Set headers for file download
        setHeader(event, "Content-Type", "application/json");
        setHeader(event, "Content-Disposition", `attachment; filename="user-data-export-${dataExport.id}.json"`);
        if (dataExport.fileSize) {
            setHeader(event, "Content-Length", dataExport.fileSize);
        }

        return jsonContent;
    }

    // If using external URL, redirect
    return sendRedirect(event, dataExport.downloadUrl);
});
