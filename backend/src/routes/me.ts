import { Router } from "express";
import { maskPhone } from "../lib/phone.js";
import { llmMode } from "../lib/llm.js";

export const meRouter = Router();

meRouter.get("/", (req, res) => {
  const u = req.user!;
  res.json({
    user: { id: u.id, name: u.name, role: u.role, phoneMasked: maskPhone(u.phoneNumber) },
    ai: { mode: llmMode() },
  });
});
