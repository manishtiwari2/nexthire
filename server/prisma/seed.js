const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Cleaning up existing data...');
  // Delete in correct order to avoid FK constraint violations
  await prisma.executionResult.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.interviewReport.deleteMany();
  await prisma.interviewParticipant.deleteMany();
  await prisma.interview.deleteMany();
  await prisma.contestQuestion.deleteMany();
  await prisma.contestParticipant.deleteMany();
  await prisma.contestInvite.deleteMany();
  await prisma.contest.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.testCase.deleteMany();
  await prisma.starterCode.deleteMany();
  await prisma.hint.deleteMany();
  await prisma.editorial.deleteMany();
  await prisma.revisionSchedule.deleteMany();
  await prisma.questionTagMap.deleteMany();
  await prisma.companyTagMap.deleteMany();
  await prisma.question.deleteMany();
  await prisma.topic.deleteMany();
  await prisma.profileSkill.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.user.deleteMany();

  console.log('Seeding new data...');

  // 1. Create Users
  const admin = await prisma.user.create({
    data: {
      email: 'admin@nexthire.com',
      name: 'Admin User',
      role: 'ADMIN',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin',
      isVerified: true,
      profile: {
        create: {
          bio: 'System Administrator',
          githubUrl: 'https://github.com/admin',
          userSkills: {
            create: [{ skillName: 'System Architecture' }, { skillName: 'Security' }]
          }
        }
      }
    }
  });

  const candidate = await prisma.user.create({
    data: {
      email: 'candidate@nexthire.com',
      name: 'Candidate User',
      role: 'CANDIDATE',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=candidate',
      isVerified: true,
      profile: {
        create: {
          bio: 'Aspiring Software Engineer',
          githubUrl: 'https://github.com/candidate',
          userSkills: {
            create: [{ skillName: 'JavaScript' }, { skillName: 'React' }, { skillName: 'Node.js' }]
          }
        }
      }
    }
  });

  // 2. Create Topics
  const arrayTopic = await prisma.topic.create({
    data: { name: 'Arrays & Hashing', slug: 'arrays-and-hashing' }
  });

  const dpTopic = await prisma.topic.create({
    data: { name: 'Dynamic Programming', slug: 'dynamic-programming' }
  });

  // 3. Create Questions
  const q1 = await prisma.question.create({
    data: {
      title: 'Two Sum',
      slug: 'two-sum',
      difficulty: 'EASY',
      topicId: arrayTopic.id,
      description: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.',
      constraints: '2 <= nums.length <= 10^4\n-10^9 <= nums[i] <= 10^9\n-10^9 <= target <= 10^9',
      timeLimitMs: 2000,
      memoryLimitMb: 256,
      starterCodes: {
        create: [
          { language: 'PYTHON', template: 'def twoSum(nums, target):\n    pass' },
          { language: 'JAVASCRIPT', template: 'function twoSum(nums, target) {\n\n}' }
        ]
      },
      testCases: {
        create: [
          { input: '[2,7,11,15]\n9', expectedOutput: '[0,1]', explanation: 'Because nums[0] + nums[1] == 9, we return [0, 1].', isSample: true, orderIndex: 0 },
          { input: '[3,2,4]\n6', expectedOutput: '[1,2]', isSample: false, orderIndex: 1 }
        ]
      },
      hints: {
        create: [
          { orderIndex: 0, content: 'A really brute force way would be to search for all possible pairs of numbers but that would be too slow.' },
          { orderIndex: 1, content: 'Try to use a hash map to store the values and their indices.' }
        ]
      },
      editorial: {
        create: {
          content: 'We can use a hash map to keep track of the numbers we have seen so far.',
          solution: 'function twoSum(nums, target) { const map = new Map(); for (let i = 0; i < nums.length; i++) { const complement = target - nums[i]; if (map.has(complement)) return [map.get(complement), i]; map.set(nums[i], i); } }'
        }
      }
    }
  });

  const q2 = await prisma.question.create({
    data: {
      title: 'Climbing Stairs',
      slug: 'climbing-stairs',
      difficulty: 'EASY',
      topicId: dpTopic.id,
      description: 'You are climbing a staircase. It takes n steps to reach the top. Each time you can either climb 1 or 2 steps. In how many distinct ways can you climb to the top?',
      constraints: '1 <= n <= 45',
      timeLimitMs: 2000,
      memoryLimitMb: 256,
      starterCodes: {
        create: [
          { language: 'PYTHON', template: 'def climbStairs(n):\n    pass' },
          { language: 'JAVASCRIPT', template: 'function climbStairs(n) {\n\n}' }
        ]
      },
      testCases: {
        create: [
          { input: '2', expectedOutput: '2', explanation: '1 step + 1 step or 2 steps', isSample: true, orderIndex: 0 },
          { input: '3', expectedOutput: '3', isSample: false, orderIndex: 1 }
        ]
      }
    }
  });

  const q3 = await prisma.question.create({
    data: {
      title: 'Valid Anagram',
      slug: 'valid-anagram',
      difficulty: 'EASY',
      topicId: arrayTopic.id,
      description: 'Given two strings s and t, return true if t is an anagram of s, and false otherwise.',
      constraints: '1 <= s.length, t.length <= 5 * 10^4\ns and t consist of lowercase English letters.',
      timeLimitMs: 2000,
      memoryLimitMb: 256,
      starterCodes: {
        create: [
          { language: 'JAVASCRIPT', template: 'function isAnagram(s, t) {\n\n}' }
        ]
      },
      testCases: {
        create: [
          { input: '"anagram"\n"nagaram"', expectedOutput: 'true', isSample: true, orderIndex: 0 }
        ]
      }
    }
  });

  // 4. Create Contest
  const contest = await prisma.contest.create({
    data: {
      title: 'Weekly Coding Challenge 1',
      description: 'Test your skills in arrays and dynamic programming.',
      startTime: new Date(Date.now() - 3600000), // 1 hour ago
      endTime: new Date(Date.now() + 3600000), // 1 hour from now
      status: 'LIVE',
      hostId: admin.id,
      questions: {
        create: [
          { questionId: q1.id, orderIndex: 0, points: 100 },
          { questionId: q2.id, orderIndex: 1, points: 150 }
        ]
      },
      participants: {
        create: [
          { userId: candidate.id, score: 0, penalty: 0, startedAt: new Date() }
        ]
      }
    }
  });

  // 5. Create Interview
  const interview = await prisma.interview.create({
    data: {
      roomCode: 'NH-LIVE-1234',
      position: 'Frontend Developer',
      scheduledAt: new Date(),
      status: 'COMPLETED',
      hostId: admin.id,
      problemId: q3.id,
      participants: {
        create: [
          { userId: admin.id, role: 'INTERVIEWER', joinedAt: new Date() },
          { userId: candidate.id, role: 'CANDIDATE', joinedAt: new Date() }
        ]
      },
      report: {
        create: {
          overallScore: 90,
          problemSolvingScore: 85,
          codeQualityScore: 95,
          communicationScore: 90,
          systemDesignScore: 80,
          feedback: 'Great performance overall.',
          strengths: 'Excellent JavaScript knowledge.',
          improvements: 'Could explain thought process better.'
        }
      }
    }
  });

  // 6. Create Submission and ExecutionResult
  const submission = await prisma.submission.create({
    data: {
      userId: candidate.id,
      questionId: q1.id,
      context: 'PRACTICE',
      code: 'function twoSum(nums, target) { return [0, 1]; }',
      language: 'JAVASCRIPT',
      status: 'ACCEPTED',
      executions: {
        create: [
          {
            status: 'ACCEPTED',
            executionTime: 45.2,
            memoryUsed: 12.4,
            passCount: 2,
            totalTestCases: 2,
            compilerOutput: 'Success'
          }
        ]
      }
    }
  });

  // 7. Create Notifications
  await prisma.notification.createMany({
    data: [
      { userId: candidate.id, title: 'Welcome', message: 'Welcome to NextHire!', type: 'SYSTEM' },
      { userId: candidate.id, title: 'Contest Started', message: 'Weekly Coding Challenge 1 is now live.', type: 'CONTEST' }
    ]
  });

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
