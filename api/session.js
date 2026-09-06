const { getSession } = require("../lib/auth");

module.exports = async (req, res) => {
  const session = getSession(req);
  res.status(200).json({ authenticated: !!session });
};
