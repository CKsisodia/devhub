import { Router } from "express";
import { llmMode } from "../lib/llm.js";

export const meRouter = Router();

meRouter.get("/", (req, res) => {
  const u = req.user!;
  res.json({
    user: { id: u.id, name: u.name, role: u.role, email: u.email },
    ai: { mode: llmMode() },
  });
});
