module.exports = async (req, res) => {
  res.setHeader("Set-Cookie", "session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
  res.status(200).json({ ok: true });
};
