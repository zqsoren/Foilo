import { z } from "zod";
const id = z.number().int().positive();
const rev = z.number().int().nonnegative();
const kg = z.number().min(0).max(10000);
const reps = z.number().int().min(0).max(10000);
const ids = z
  .array(id)
  .min(1)
  .max(100)
  .refine((a) => new Set(a).size === a.length);
const item = z.object({
  exerciseId: id,
  sets: z.number().int().min(1).max(30),
});
const current = { workoutId: id, revision: rev };
export const gymCommand = z.discriminatedUnion("type", [
  z.object({ type: z.literal("archivePlan"), planId:id, revision:rev }),
  z.object({ type: z.literal("cardioHeartRate"), ...current, setId:id, bpm:z.number().positive().max(300) }),
  z.object({ type: z.literal("itemNote"), ...current, itemId:id, text:z.string().trim().max(2000) }),
  z.object({
    type: z.literal("savePlan"),
    planId: id.optional(),
    revision: rev.optional(),
    name: z.string().trim().min(1).max(50),
    items: z
      .array(item)
      .min(1)
      .max(100)
      .refine((a) => new Set(a.map((x) => x.exerciseId)).size === a.length),
  }),
  z.object({ type: z.literal("start"), planId: id }),
  z.object({ type: z.literal("append"), ...current, exerciseIds: ids }),
  z.object({ type: z.literal("addSet"), ...current, itemId: id }),
  z.object({
    type: z.literal("record"),
    ...current,
    setId: id,
    kg,
    reps,
    rightKg: kg,
    rightReps: reps,
    seconds: z.number().int().min(0).max(86400),
    done: z.boolean(),
  }),
  z.object({
    type: z.literal("note"),
    ...current,
    text: z.string().trim().max(2000),
  }),
  z.object({ type: z.literal("copySet"), ...current, setId: id }),
  z.object({ type: z.literal("deleteHistory"), ...current }),
  z.object({
    type: z.literal("recordStages"), ...current, setId: id, done: z.boolean(),
    stages: z.array(z.object({ kg, reps, rightKg: kg, rightReps: reps, measure:z.number().nonnegative().max(100000).nullable().optional(), seconds: z.number().int().min(0).max(86400) })).min(1).max(30),
  }),
  z.object({ type: z.literal("finish"), ...current }),
  z.object({ type: z.literal("discard"), ...current }),
]);
export type Command = z.infer<typeof gymCommand>;
