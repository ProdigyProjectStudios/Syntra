import { Router, type IRouter } from "express";
import healthRouter from "./health";
import advisorRouter from "./advisor";
import opportunityRouter from "./opportunity";
import evidenceRouter from "./evidence";
import actionRouter from "./action";
import { privateSession } from "../middlewares/privacy";

const router: IRouter = Router();

router.use(healthRouter);
router.use(privateSession);
router.use(advisorRouter);
router.use(opportunityRouter);
router.use(evidenceRouter);
router.use(actionRouter);

export default router;
