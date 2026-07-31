# Sandbox runner image for Java submissions.
# Build:  docker build -t nexthire-judge-java -f docker/Dockerfile.java .
# Then point JUDGE_IMAGE_JAVA=nexthire-judge-java (optional; the default is eclipse-temurin:17-jdk).
FROM eclipse-temurin:17-jdk

RUN useradd -u 1000 -m runner
USER runner
WORKDIR /judge
