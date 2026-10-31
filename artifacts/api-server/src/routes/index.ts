import { Router, type IRouter } from "express";
import healthRouter from "./health";
import advisorRouter from "./advisor";

const router: IRouter = Router();

router.use(healthRouter);
router.use(advisorRouter);

export default router;
