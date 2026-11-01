import { Router, type IRouter } from "express";
import healthRouter from "./health";
import advisorRouter from "./advisor";
import opportunityRouter from "./opportunity";
import evidenceRouter from "./evidence";
import actionRouter from "./action";
import { visitorSession } from "../middlewares/visitor-session";

const router: IRouter = Router();

router.use(healthRouter);
router.use(visitorSession);
router.use(advisorRouter);
router.use(opportunityRouter);
router.use(evidenceRouter);
router.use(actionRouter);

export default router;
