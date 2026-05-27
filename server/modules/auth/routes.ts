import { Router, type Express } from "express";
import passport from "passport";
import type { User } from "@shared/schema";
import { isAuthenticated } from "../../middlewares/auth";
import { createRateLimit } from "../../middlewares/rate-limit";
import { ensureCsrfToken } from "../../utils/csrf";

export const authRouter = Router();

const loginRateLimit = createRateLimit({
  name: "auth-login",
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Muitas tentativas de login. Tente novamente em alguns minutos.",
});

authRouter.post("/login", loginRateLimit, (req, res, next) => {
  passport.authenticate("local", (err: any, user: Express.User, info: any) => {
    if (err) return next(err);
    if (!user) {
      return res.status(401).json({ message: info?.message || "Authentication failed" });
    }

    req.session.regenerate((sessionErr) => {
      if (sessionErr) return next(sessionErr);

      req.login(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        const csrfToken = ensureCsrfToken(req);
        const { password: _, ...userWithoutPassword } = user as User;
        res.json({ user: userWithoutPassword, csrfToken });
      });
    });
  })(req, res, next);
});

authRouter.post("/logout", (req, res) => {
  req.logout(() => {
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ message: "Logged out successfully" });
    });
  });
});

authRouter.get("/me", isAuthenticated, (req, res) => {
  const csrfToken = ensureCsrfToken(req);
  const { password: _, ...userWithoutPassword } = req.user as User;
  res.json({ user: userWithoutPassword, csrfToken });
});
