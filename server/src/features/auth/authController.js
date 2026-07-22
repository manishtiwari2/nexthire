const { prisma } = require('../../shared/db');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./authMiddleware');

function determineRole(email) {
  const normalized = email.toLowerCase().trim();
  if (normalized === 'anuradha@admin.at' || normalized === 'manish@admin.mt') {
    return 'ADMIN';
  }
  return 'CANDIDATE';
}

async function googleLogin(req, res) {
  try {
    let { credential, email, name, avatarUrl, googleId } = req.body;

    if (credential) {
      const decoded = jwt.decode(credential);
      if (decoded) {
        email = email || decoded.email;
        name = name || decoded.name || decoded.given_name;
        avatarUrl = avatarUrl || decoded.picture;
        googleId = googleId || decoded.sub;
      }
    }

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required for Google auth' });
    }

    const assignedRole = determineRole(email);

    let user = await prisma.user.findUnique({
      where: { email },
      include: { profile: { include: { userSkills: true } } }
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: name || email.split('@')[0].replace(/[^a-zA-Z]/g, ' ').trim() || 'User',
          avatarUrl: avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(email)}`,
          role: assignedRole,
          googleId: googleId || `gid-${Date.now()}`
        },
        include: { profile: { include: { userSkills: true } } }
      });

      await prisma.profile.create({
        data: { userId: user.id }
      });
    } else {
      if (user.role !== assignedRole) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { role: assignedRole },
          include: { profile: { include: { userSkills: true } } }
        });
      }
    }

    const tokenPayload = { id: user.id, email: user.email, name: user.name, role: user.role };
    const accessToken = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      data: {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          avatarUrl: user.avatarUrl
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    let user = await prisma.user.findUnique({ where: { email } });
    const assignedRole = determineRole(email);

    if (!user) {
      // Auto-create account for demo convenience
      user = await prisma.user.create({
        data: {
          email,
          name: email.split('@')[0].replace(/[^a-zA-Z]/g, ' ').trim() || 'User',
          role: assignedRole,
          avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(email)}`
        }
      });
      await prisma.profile.create({ data: { userId: user.id } });
    } else {
      if (user.role !== assignedRole) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { role: assignedRole }
        });
      }
    }

    const tokenPayload = { id: user.id, email: user.email, name: user.name, role: user.role };
    const accessToken = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      data: {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          avatarUrl: user.avatarUrl
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function getMe(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { profile: { include: { userSkills: true } } }
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = { googleLogin, login, getMe };
