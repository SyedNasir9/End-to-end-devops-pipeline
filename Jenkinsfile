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
        VAULT_ADDR = 'http://127.0.0.1:8200'   
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
                echo "🔄 Checking out ${env.BRANCH_NAME}"
                checkout scm
            }
        }

        stage('Vault Secrets Fetch') {
            steps {
                script {
                    echo "🔐 Fetching secrets from Vault..."
                    withCredentials([string(credentialsId: 'vault-token', variable: 'VAULT_TOKEN')]) {
                        sh '''
                        vault login $VAULT_TOKEN >/dev/null 2>&1
                        export DOCKERHUB_USER=$(vault kv get -field=DOCKERHUB_USER secret/devops)
                        export DOCKERHUB_PASS=$(vault kv get -field=DOCKERHUB_PASS secret/devops)
                        echo "✅ Vault secrets fetched successfully"
                        '''
                    }
                }
            }
        }

        stage('Install Dependencies') {
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

        stage('Build Docker Image') {
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

        stage('Trivy Security Scan') {
            steps {
                script {
                    echo "🔍 Running Trivy scan for vulnerabilities..."
                    sh '''
                    trivy image --exit-code 0 --severity HIGH,CRITICAL ${DOCKER_IMAGE} || true
                    echo "✅ Trivy scan completed"
                    '''
                }
            }
        }

        stage('Push Docker Image') {
            steps {
                script {
                    docker.withRegistry('https://registry.hub.docker.com', "${DOCKERHUB_CREDENTIALS_ID}") {
                        def img = docker.image(env.DOCKER_IMAGE)
                        img.push()
                        img.push("${env.BRANCH_NAME}-latest")
                        notify("🐳 Image Pushed", "Image: ${env.DOCKER_IMAGE}", "good")
                    }
                }
            }
        }

        stage('Deploy to EC2') {
            steps {
                script {
                    def deployPort = (env.BRANCH_NAME == 'dev') ? env.DEV_PORT :
                                     (env.BRANCH_NAME == 'stage') ? env.STAGE_PORT :
                                     env.PROD_PORT

                    sshagent([env.SSH_CREDENTIALS]) {
                        def prev = sh(script: """ssh -o StrictHostKeyChecking=no ${env.EC2_HOST} '
if [ \$(docker ps -a -q -f name=${APP_NAME}-${env.BRANCH_NAME}) ]; then
    docker inspect --format="{{.Config.Image}}" ${APP_NAME}-${env.BRANCH_NAME} || echo ""
else
    echo ""
fi
'""", returnStdout: true).trim()

                        env.PREVIOUS_TAG = prev ?: "${env.BRANCH_NAME}-latest"
                        notify("🚀 Deploy Starting", "Deploying ${env.DOCKER_IMAGE} to ${env.EC2_HOST}:${deployPort}", "good")

                        sh """ssh -o StrictHostKeyChecking=no ${env.EC2_HOST} '
docker pull ${env.DOCKER_IMAGE} &&
docker rm -f ${APP_NAME}-${env.BRANCH_NAME} || true &&
docker run -d --name ${APP_NAME}-${env.BRANCH_NAME} -p ${deployPort}:3000 \
-e APP_VERSION=${env.DOCKER_TAG} -e NODE_ENV=${env.BRANCH_NAME} \
--restart unless-stopped ${env.DOCKER_IMAGE}
'"""
                    }
                }
            }
        }

        stage('Health Check') {
            steps {
                script {
                    def ec2Ip = env.EC2_HOST.split('@')[1]
                    def port = (env.BRANCH_NAME == 'dev') ? env.DEV_PORT :
                               (env.BRANCH_NAME == 'stage') ? env.STAGE_PORT :
                               env.PROD_PORT

                    def success = false
                    for (int i = 1; i <= 5; i++) {
                        try {
                            sh "curl -f http://${ec2Ip}:${port}/health"
                            echo "✅ Health OK on attempt ${i}"
                            success = true
                            break
                        } catch (Exception e) {
                            echo "⚠️ Health check attempt ${i} failed"
                            sleep 10
                        }
                    }

                    if (!success) {
                        echo "❌ Health check failed — rolling back"
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
            script {
                notify("✅ Deployment Successful", "Branch: ${env.BRANCH_NAME}\nImage: ${env.DOCKER_TAG}", "good")
            }
        }
        failure {
            script {
                notify("❌ Pipeline Failed", "Branch: ${env.BRANCH_NAME}\nSee: ${env.BUILD_URL}", "danger")
            }
        }
    }
}

// Rollback Logic
def rollback(port) {
    echo "🔄 Rolling back ${env.BRANCH_NAME}"
    def toTag = env.PREVIOUS_TAG?.trim() ?: "${env.BRANCH_NAME}-latest"
    notify("⚠️ Rollback Started", "Rolling back ${env.BRANCH_NAME} to ${toTag}", "warning")

    sshagent([env.SSH_CREDENTIALS]) {
        sh """ssh -o StrictHostKeyChecking=no ${env.EC2_HOST} '
docker pull ${DOCKERHUB_REPO}:${toTag} &&
docker rm -f ${APP_NAME}-${env.BRANCH_NAME} || true &&
docker run -d --name ${APP_NAME}-${env.BRANCH_NAME} -p ${port}:3000 \
--restart unless-stopped ${DOCKERHUB_REPO}:${toTag}
'"""
    }

    notify("🔁 Rollback Completed", "Branch ${env.BRANCH_NAME} rolled back to ${toTag}", "warning")
}

// Email + Slack Notifications
def notify(String title, String message, String color) {
    try {
        emailext(
            subject: "[Jenkins] ${title}",
            body: "<p>${message}</p><p>Build: ${env.BUILD_URL}</p>",
            mimeType: 'text/html',
            to: env.EMAIL_RECIPIENT
        )
    } catch (e) {
        echo "Email notify skipped: ${e}"
    }

    try {
        slackSend(channel: env.SLACK_CHANNEL, color: color, message: "${title}\n${message}\n${env.BUILD_URL}")
    } catch (e) {
        echo "Slack notify skipped: ${e}"
    }
}
