import { Router } from "express";
import { authController } from "./auth.controller.js";
import { validateBody } from "../../middleware/validate.js";
import { authRateLimiter, refreshRateLimiter } from "../../middleware/rateLimit.js";
import { authenticate } from "../../middleware/auth.js";
import { registerSchema, loginSchema, refreshSchema } from "./auth.schemas.js";

const router = Router();

router.post(
  "/register",
  authRateLimiter,
  validateBody(registerSchema),
  (req, res) => authController.register(req, res)
);

router.post(
  "/login",
  authRateLimiter,
  validateBody(loginSchema),
  (req, res) => authController.login(req, res)
);

router.post(
  "/refresh",
  refreshRateLimiter,
  validateBody(refreshSchema),
  (req, res) => authController.refresh(req, res)
);

router.post("/logout", (req, res) => authController.logout(req, res));

router.get("/me", authenticate, (req, res) => authController.me(req, res));

export default router;

