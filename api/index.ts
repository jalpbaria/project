let handler;

try {
  const serverModule = require('../server');
  handler = serverModule.default || serverModule;
} catch (err) {
  console.error("Vercel Startup Error:", err);
  handler = (req, res) => {
    res.status(500).json({
      error: "Vercel Startup Crash",
      message: err.message || err,
      stack: err.stack
    });
  };
}

export default function (req, res) {
  return handler(req, res);
}
