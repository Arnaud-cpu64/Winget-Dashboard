import { Router, type IRouter } from "express";
import healthRouter from "./health";
import packagesRouter from "./packages";
import wingetRouter from "./winget";
import updatesRouter, { startUpdateScheduler } from "./updates";
import sccmRouter from "./sccm";

const router: IRouter = Router();

router.use(healthRouter);
router.use(updatesRouter);
router.use(sccmRouter);
router.use(packagesRouter);
router.use(wingetRouter);

startUpdateScheduler();

export default router;
