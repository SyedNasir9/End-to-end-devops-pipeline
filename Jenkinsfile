pipeline {
    agent any

    environment {
        DOCKERHUB_REPO = 'syednasir9/devops-pipeline'
        APP_NAME = 'devops-pipeline'

        DEV_PORT = '3001'
        STAGE_PORT = '3002'
        PROD_PORT = '3000'

        EC2_HOST = 'ubuntu@3.109.183.207'
        SSH_CREDENTIALS = 'ec2-ssh-key'
        DOCKERHUB_CREDENTIALS_ID = 'dockerhub-credentials'
        EMAIL_RECIPIENT = 'nasirsyed652@gmail.com'
        SLACK_CHANNEL = '#devops'
    }

    options {
        skipDefaultCheckout(false)
        timestamps()
    }

    stages {
        stage('Checkout') {
            steps {
                echo "🔄 Checkout ${env.BRANCH_NAME}"
                checkout scm
            }
        }

        stage('Install') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Lint') {
            steps {
                sh 'npm run lint || true'
            }
        }

        stage('Test') {
            steps {
                sh 'npm test'
            }
        }

        stage('Build Docker') {
            steps {
                script {
                    def tag = "${env.BRANCH_NAME}-${env.BUILD_NUMBER}"
                    env.DOCKER_IMAGE = "${DOCKERHUB_REPO}:${tag}"
                    env.DOCKER_TAG = tag
                    echo "🐳 Building ${env.DOCKER_IMAGE}"
                    docker.build(env.DOCKER_IMAGE)
                }
            }
        }

        stage('Push Docker') {
            steps {
                script {
                    docker.withRegistry('https://registry.hub.docker.com', "${DOCKERHUB_CREDENTIALS_ID}") {
                        def img = docker.image(env.DOCKER_IMAGE)
                        img.push()
                        img.push("${env.BRANCH_NAME}-latest")

                        // Slack notification for Docker push
                        notify("🐳 Image Pushed", "Image: ${env.DOCKER_IMAGE}\nTagged as: ${env.BRANCH_NAME}-latest", "good")
                    }
                }
            }
        }

        stage('Deploy to EC2') {
            steps {
                script {
                    def deployPort = env.PROD_PORT
                    if (env.BRANCH_NAME == 'dev') deployPort = env.DEV_PORT
                    if (env.BRANCH_NAME == 'stage') deployPort = env.STAGE_PORT

                    sshagent([env.SSH_CREDENTIALS]) {
                        // Grab previous deployed image safely
                        def prev = sh(script: """ssh -o StrictHostKeyChecking=no ${env.EC2_HOST} '
if [ \$(docker ps -a -q -f name=${APP_NAME}-${env.BRANCH_NAME}) ]; then
    docker inspect --format="{{.Config.Image}}" ${APP_NAME}-${env.BRANCH_NAME} || echo ''
else
    echo ''
fi
'""", returnStdout: true).trim()

                        env.PREVIOUS_TAG = prev ?: "${env.BRANCH_NAME}-latest"
                        echo "Previous deployed image: '${env.PREVIOUS_TAG}'"

                        // Slack notification for deploy start
                        notify("🚀 Deploy Starting", "Deploying: ${env.DOCKER_IMAGE}\nTo: ${env.EC2_HOST}:${deployPort}\nPrevious: ${env.PREVIOUS_TAG}", "good")

                        // Run new container
                        sh """ssh -o StrictHostKeyChecking=no ${env.EC2_HOST} '
docker pull ${env.DOCKER_IMAGE} &&
if [ \$(docker ps -a -q -f name=${APP_NAME}-${env.BRANCH_NAME}) ]; then
    docker rm -f ${APP_NAME}-${env.BRANCH_NAME}
fi &&
docker run -d --name ${APP_NAME}-${env.BRANCH_NAME} -p ${deployPort}:3000 \
    -e APP_VERSION=${env.DOCKER_TAG} -e NODE_ENV=${env.BRANCH_NAME} --restart unless-stopped ${env.DOCKER_IMAGE}
'"""
                    }
                }
            }
        }

        stage('Health Check') {
            steps {
                script {
                    def ec2Ip = env.EC2_HOST.split('@')[1]
                    def port = env.PROD_PORT
                    if (env.BRANCH_NAME == 'dev') port = env.DEV_PORT
                    if (env.BRANCH_NAME == 'stage') port = env.STAGE_PORT

                    def maxRetries = 5
                    def success = false
                    for (int i = 1; i <= maxRetries; i++) {
                        try {
                            sh "curl -f http://${ec2Ip}:${port}/health"
                            success = true
                            echo "✅ Health OK on attempt ${i}"
                            break
                        } catch (Exception e) {
                            echo "⚠️ Health check attempt ${i} failed"
                            sleep 10
                        }
                    }
                    if (!success) {
                        echo "❌ Health failed after ${maxRetries} attempts — rolling back"
                        rollback(port)
                        error("Health check failed; rollback attempted")
                    }
                }
            }
        }
    }

    post {
        always {
            cleanWs()
        }
        success {
            script { notify("✅ Deployment Successful", "Branch: ${env.BRANCH_NAME}\nImage: ${env.DOCKER_TAG}", "good") }
        }
        failure {
            script { notify("❌ Pipeline Failed", "Branch: ${env.BRANCH_NAME}\nSee ${env.BUILD_URL}", "danger") }
        }
    }
}

// rollback uses env.PREVIOUS_TAG captured during Deploy stage
def rollback(port) {
    echo "🔄 Rolling back ${env.BRANCH_NAME}"
    def toTag = env.PREVIOUS_TAG?.trim()
    if (!toTag) {
        toTag = "${env.BRANCH_NAME}-latest"
        echo "No previous tag detected; falling back to ${toTag}"
    } else {
        echo "Rolling back to ${toTag}"
    }

    // Slack notification for rollback start
    notify("⚠️ Rollback Started", "Rolling back ${env.BRANCH_NAME} to ${toTag}", "warning")

    sshagent([env.SSH_CREDENTIALS]) {
        sh """ssh -o StrictHostKeyChecking=no ${env.EC2_HOST} '
docker pull ${DOCKERHUB_REPO}:${toTag} &&
if [ \$(docker ps -a -q -f name=${APP_NAME}-${env.BRANCH_NAME}) ]; then
    docker rm -f ${APP_NAME}-${env.BRANCH_NAME}
fi &&
docker run -d --name ${APP_NAME}-${env.BRANCH_NAME} -p ${port}:3000 \
    -e APP_VERSION=${toTag} -e NODE_ENV=${env.BRANCH_NAME} --restart unless-stopped ${DOCKERHUB_REPO}:${toTag}
'"""
    }

    // Slack notification for rollback completed
    notify("🔄 Rollback Completed", "Branch ${env.BRANCH_NAME} rolled back to ${toTag}", "warning")
}

def notify(String title, String message, String color) {
    try {
        emailext subject: "[Jenkins] ${title}",
                 body: "<p>${message}</p><p>Build: ${env.BUILD_URL}</p>",
                 mimeType: 'text/html',
                 to: env.EMAIL_RECIPIENT
    } catch (e) {
        echo "Email notify skipped: ${e}"
    }

    try {
        slackSend channel: env.SLACK_CHANNEL, color: color, message: "${title}\n${message}\n${env.BUILD_URL}"
    } catch (e) {
        echo "Slack notify skipped: ${e}"
    }
}
