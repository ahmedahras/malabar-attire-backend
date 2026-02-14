const toCamelCase = (value: string) => {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
};

export const keysToCamel = (input: unknown): unknown => {
  if (Array.isArray(input)) {
    return input.map((item) => keysToCamel(item));
  }

  if (input !== null && typeof input === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      result[toCamelCase(key)] = keysToCamel(value);
    }
    return result;
  }

  return input;
};
