pipeline {
    agent any

    environment {
        DOCKERHUB_REPO = 'syednasir9/devops-pipeline'        // replace if needed
        APP_NAME = 'devops-pipeline'

        DEV_PORT = '3001'
        STAGE_PORT = '3002'
        PROD_PORT = '3000'

        EC2_HOST = 'ubuntu@3.109.183.207'                    
        SSH_CREDENTIALS = 'ec2-ssh-key'                      // Jenkins credentials id for SSH key 
        DOCKERHUB_CREDENTIALS_ID = 'dockerhub-credentials'   // Jenkins credentials id (username/password)
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
                        sh """
                            ssh -o StrictHostKeyChecking=no ${env.EC2_HOST} '
                                docker pull ${env.DOCKER_IMAGE} &&
                                if [ \$(docker ps -a -q -f name=${APP_NAME}-${env.BRANCH_NAME}) ]; then
                                   docker rm -f ${APP_NAME}-${env.BRANCH_NAME}
                                fi &&
                                docker run -d --name ${APP_NAME}-${env.BRANCH_NAME} -p ${deployPort}:3000 \
                                    -e APP_VERSION=${env.DOCKER_TAG} -e NODE_ENV=${env.BRANCH_NAME} --restart unless-stopped ${env.DOCKER_IMAGE}
                            '
                        """
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

def rollback(port) {
    echo "🔄 Rolling back ${env.BRANCH_NAME}"
    sshagent([env.SSH_CREDENTIALS]) {
        sh """
            ssh -o StrictHostKeyChecking=no ${env.EC2_HOST} '
                docker pull ${DOCKERHUB_REPO}:${env.BRANCH_NAME}-latest &&
                if [ \$(docker ps -a -q -f name=${APP_NAME}-${env.BRANCH_NAME}) ]; then
                   docker rm -f ${APP_NAME}-${env.BRANCH_NAME}
                fi &&
                docker run -d --name ${APP_NAME}-${env.BRANCH_NAME} -p ${port}:3000 \
                    -e APP_VERSION=rollback -e NODE_ENV=${env.BRANCH_NAME} --restart unless-stopped ${DOCKERHUB_REPO}:${env.BRANCH_NAME}-latest
            '
        """
    }
    notify("🔄 Rollback Completed", "Branch ${env.BRANCH_NAME} rolled back to ${env.BRANCH_NAME}-latest", "warning")
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
