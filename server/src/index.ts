import express from "express";
import aboutRouter from "./routes/about";
 
const app = express();
const PORT = 8080;
 
app.use(express.json());
app.use(aboutRouter);
 
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
 