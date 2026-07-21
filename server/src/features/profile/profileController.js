const { prisma } = require('../../shared/db');

async function getProfile(req, res) {
  try {
    let profile = await prisma.profile.findUnique({
      where: { userId: req.user.id },
      include: { user: true, userSkills: true }
    });
    if (!profile) {
      profile = await prisma.profile.create({
        data: { userId: req.user.id },
        include: { user: true, userSkills: true }
      });
    }
    res.json({ success: true, data: profile });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function updateProfile(req, res) {
  try {
    const { name, bio, githubUrl, linkedinUrl, skills } = req.body;

    if (name) {
      await prisma.user.update({
        where: { id: req.user.id },
        data: { name }
      });
    }

    const profile = await prisma.profile.upsert({
      where: { userId: req.user.id },
      update: { bio, githubUrl, linkedinUrl },
      create: { userId: req.user.id, bio, githubUrl, linkedinUrl }
    });

    if (skills) {
      const skillList = typeof skills === 'string' ? skills.split(',').map(s => s.trim()).filter(Boolean) : (Array.isArray(skills) ? skills : []);
      await prisma.profileSkill.deleteMany({ where: { profileId: profile.id } });
      if (skillList.length > 0) {
        await prisma.profileSkill.createMany({
          data: skillList.map((s) => ({ profileId: profile.id, skillName: String(s) }))
        });
      }
    }

    const updated = await prisma.profile.findUnique({
      where: { id: profile.id },
      include: { user: true, userSkills: true }
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = { getProfile, updateProfile };
