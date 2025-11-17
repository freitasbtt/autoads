import { Router, type Express } from "express";
import passport from "passport";
import type { User } from "@shared/schema";
import { isAuthenticated } from "../../middlewares/auth";

export const authRouter = Router();

authRouter.post("/login", (req, res, next) => {
  passport.authenticate("local", (err: any, user: Express.User, info: any) => {
    if (err) return next(err);
    if (!user) {
      return res.status(401).json({ message: info?.message || "Authentication failed" });
    }

    req.login(user, (loginErr) => {
      if (loginErr) return next(loginErr);
      const { password: _, ...userWithoutPassword } = user as User;
      res.json({ user: userWithoutPassword });
    });
  })(req, res, next);
});

authRouter.post("/logout", (req, res) => {
  req.logout(() => {
    res.json({ message: "Logged out successfully" });
  });
});

authRouter.get("/me", isAuthenticated, (req, res) => {
  const { password: _, ...userWithoutPassword } = req.user as User;
  res.json({ user: userWithoutPassword });
});

