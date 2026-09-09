import { z } from "zod";

export const toStrictJsonSchema = (
  schema: z.ZodType,
): Record<string, unknown> => {
  const json = z.toJSONSchema(schema, { target: "draft-7" }) as Record<
    string,
    unknown
  >;
  return enforceStrict(json) as Record<string, unknown>;
};

const enforceStrict = (node: unknown): unknown => {
  if (Array.isArray(node)) {
    return node.map(enforceStrict);
  }

  if (node && typeof node === "object") {
    const obj: Record<string, unknown> = {
      ...(node as Record<string, unknown>),
    };

    if (obj.type === "object" && obj.properties) {
      obj.additionalProperties = false;
      obj.required = Object.keys(obj.properties as Record<string, unknown>);
    }

    for (const key of Object.keys(obj)) {
      obj[key] = enforceStrict(obj[key]);
    }

    return obj;
  }

  return node;
};
