# Sandbox runner image for C++ submissions.
# Build:  docker build -t nexthire-judge-cpp -f docker/Dockerfile.cpp .
# Then point JUDGE_IMAGE_CPP=nexthire-judge-cpp (optional; the default is gcc:13).
FROM gcc:13

RUN useradd -u 1000 -m runner
USER runner
WORKDIR /judge
