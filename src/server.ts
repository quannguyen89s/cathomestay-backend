import "dotenv/config";
import connectDB from "./config/db.js";
import { seedDefaultTemplates } from "./models/PricingTemplate.js";
import { env } from "./config/env.js";
import app from "./app.js";

connectDB().then(() => seedDefaultTemplates());

app.listen(env.PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${env.PORT}`);
});

export default app;
