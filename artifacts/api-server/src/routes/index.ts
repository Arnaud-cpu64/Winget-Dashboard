import { Router, type IRouter } from "express";
import healthRouter from "./health";
import packagesRouter from "./packages";
import wingetRouter from "./winget";

const router: IRouter = Router();

router.use(healthRouter);
router.use(packagesRouter);
router.use(wingetRouter);

export default router;
