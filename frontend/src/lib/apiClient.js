// Re-export the shared apiClient so components that import from "lib/apiClient"
// work seamlessly alongside those that import from "services/api".
export { apiClient as default, apiClient } from "../services/api";