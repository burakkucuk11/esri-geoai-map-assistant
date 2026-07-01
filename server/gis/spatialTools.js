export const spatialTools = {
  buffer: {
    name: "buffer",
    operationType: "spatial_analysis",
    description: "Bir katmanin veya secili objelerin etrafinda tampon alan uretir.",
    requiredRoles: ["source"],
    implemented: true
  },
  intersect: {
    name: "intersect",
    operationType: "spatial_analysis",
    description: "Iki katmanin kesisen kayitlarini bulur.",
    requiredRoles: ["source", "target"],
    implemented: true
  },
  within_distance: {
    name: "within_distance",
    operationType: "spatial_analysis",
    description: "Bir katmana belirli mesafe icinde kalan diger katman kayitlarini bulur.",
    requiredRoles: ["source", "target"],
    implemented: true
  },
  nearest_feature: {
    name: "nearest_feature",
    operationType: "spatial_analysis",
    description: "Bir noktaya veya objeye en yakin kayitlari bulur.",
    requiredRoles: ["source", "target"],
    implemented: true
  },
  spatial_join: {
    name: "spatial_join",
    operationType: "spatial_analysis",
    description: "Bir katmandaki objeleri baska bir katmanla mekansal olarak iliskilendirir.",
    requiredRoles: ["source", "target"],
    implemented: false
  },
  aggregate_by_polygon: {
    name: "aggregate_by_polygon",
    operationType: "aggregation",
    description: "Detaylari polygon/grid/mahalle gibi alanlara gore ozetler.",
    requiredRoles: ["polygon", "target"],
    implemented: true
  },
  density_summary: {
    name: "density_summary",
    operationType: "aggregation",
    description: "Nokta verilerinin yogunluk veya dagilim ozetini uretir.",
    requiredRoles: ["target"],
    implemented: false
  }
};

export function listSpatialToolsForPrompt() {
  return Object.values(spatialTools).map((tool) => ({
    name: tool.name,
    operationType: tool.operationType,
    description: tool.description,
    requiredRoles: tool.requiredRoles,
    implemented: tool.implemented
  }));
}

export function getSpatialTool(name) {
  return spatialTools[String(name || "").trim().toLowerCase()] || null;
}
