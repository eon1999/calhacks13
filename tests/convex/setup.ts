import { convexTest } from "convex-test";
import schema from "../../convex/schema";

export const modules = import.meta.glob("../../convex/**/*.*s");

export function backend() {
  return convexTest(schema, modules);
}
