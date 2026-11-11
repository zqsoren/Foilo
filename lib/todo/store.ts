import { sqlite } from "@/lib/db";
import { todoRepository } from "./repository";
export { TodoConflict } from "./repository";
export const { readTodo, writeTodo, readActivity } = todoRepository(sqlite);
