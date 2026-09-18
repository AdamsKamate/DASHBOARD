import express from "express";
import aboutRouter from "./routes/about";

const app = express();
const PORT = 8080; // required by the assignment, do not make configurable

// Required for req.ip to return the client's real IP behind Docker,
// rather than the internal IP of the container network.
app.set("trust proxy", true);

app.use(express.json());
app.use(aboutRouter);

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`about.json: http://localhost:${PORT}/about.json`);
});
