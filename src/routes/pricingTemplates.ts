import { Router } from "express";
import { listTemplates } from "../controllers/pricingTemplateController.js";

const router = Router();

// Public — any client can fetch templates (needed when loading HomestayForm / booking page)
router.get("/", listTemplates);

export default router;
