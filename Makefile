up:
	docker compose up -d --build --force-recreate
	
down:
	docker compose down
	-docker container rm ids_op
	-docker container rm cpds_api
	-docker container rm aceas_api
	-docker image rm app-sso-ids
	-docker image rm app-sso-cpds-api
	-docker image rm app-sso-aceas-api

re-ids:
	 docker-compose up -d --no-deps --build --force-recreate ids
re-cpds:
	 docker-compose up -d --no-deps --build --force-recreate cpds-api
re-aceas:
	 docker-compose up -d --no-deps --build --force-recreate aceas-api
re-web:
	 docker-compose up -d --no-deps --build --force-recreate web
re-idp:
	 docker-compose up -d --no-deps --build --force-recreate keycloak_idp
re-kc:
	 docker-compose up -d --no-deps --build --force-recreate keycloak

log-ids:
	docker logs ids_op -f 
log-cpds:
	docker logs cpds_api -f 
log-aceas:
	docker logs aceas_api -f 
log-web:
	docker logs web -f 
log-idp:
	docker logs keycloak_singpass -f
log-kc:
	docker logs keycloak_agency -f